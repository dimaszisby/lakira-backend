import logger from "@/utils/logger.js";
import { WORKER_DRAIN_TIMEOUT_MS } from "@/utils/shutdown.js";

/** What the worker opens, and so closes. */
export type WorkerResources = {
  consumers: Array<{ close: (drainTimeoutMs?: number) => Promise<void> }>;
  /** Consumers republish failed messages through it; closed after they drain. */
  retryPublisher: { close: () => Promise<void> } | null;
  disconnectRabbitMQ: () => Promise<void>;
  /** Opened on import by the auth feature, for the login lockout (audit 2026-10-20 X66). */
  disconnectRedis: () => Promise<void>;
  closeDatabase: () => Promise<void>;
};

/** How long the worker's flush gives Sentry; the deadline's own flush cuts it to 1 s. */
export const ERROR_REPORT_FLUSH_MS = 2_000;

/**
 * The worker's flush for `createShutdown`: its logs and what Sentry holds, side by side
 * (ADR-0103). `createShutdown` runs it after the steps whether or not they threw, and again
 * when the deadline passes, so a crash's report goes even when a close fails or hangs.
 */
export const buildWorkerFlush =
  (deps: {
    flushLogs: () => Promise<void>;
    flushErrorReports: (timeoutMs: number) => Promise<void>;
  }) =>
  async (): Promise<void> => {
    await Promise.allSettled([
      deps.flushErrorReports(ERROR_REPORT_FLUSH_MS),
      deps.flushLogs(),
    ]);
  };

/**
 * The worker's shutdown steps, for `createShutdown` (ADR-0076). Read lazily: the consumers
 * exist only once the worker has started.
 *
 * On a clean stop the consumers drain, within a bound that leaves the closes after them inside
 * the deadline. After a crash they close without draining, as the server skips its drain: the
 * process state is unknown, unacked messages return to the queue, and a job that had committed
 * is absorbed by the dedup on redelivery (queue-failure-paths D-04, ADR-0080; audit X67).
 */
export const buildWorkerShutdownSteps =
  (resources: () => WorkerResources) =>
  async (exitCode: number): Promise<void> => {
    const {
      consumers,
      retryPublisher,
      disconnectRabbitMQ,
      disconnectRedis,
      closeDatabase,
    } = resources();
    const drainTimeoutMs = exitCode === 0 ? WORKER_DRAIN_TIMEOUT_MS : 0;

    await Promise.all(consumers.map((c) => c.close(drainTimeoutMs)));
    logger.info(
      drainTimeoutMs > 0
        ? "[WORKER] All consumers drained."
        : "[WORKER] All consumers closed without draining.",
    );

    await retryPublisher?.close();

    await disconnectRabbitMQ();
    logger.info("[WORKER] RabbitMQ disconnected.");

    await disconnectRedis();

    await closeDatabase();
    logger.info("[WORKER] Database disconnected.");
  };
