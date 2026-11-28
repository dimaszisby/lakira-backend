import { describe, it, expect, jest } from "@jest/globals";
import {
  ERROR_REPORT_FLUSH_MS,
  buildWorkerFlush,
  buildWorkerShutdownSteps,
} from "@/worker-shutdown.js";
import { WORKER_DRAIN_TIMEOUT_MS, createShutdown } from "@/utils/shutdown.js";

/**
 * Kit queue-failure-paths (audit 2026-10-20): the worker drained for 20 s after a crash, which
 * the server does not (X67, D-04), and never closed the Redis client the auth feature opens
 * (X66).
 */
const build = () => {
  const order: string[] = [];
  const consumer = {
    close: jest.fn(async (drainTimeoutMs?: number) => {
      void drainTimeoutMs;
      order.push("consumers");
    }),
  };
  const deps = {
    consumers: [consumer, consumer],
    retryPublisher: {
      close: jest.fn(async () => {
        order.push("publisher");
      }),
    },
    disconnectRabbitMQ: jest.fn(async () => {
      order.push("rabbitmq");
    }),
    disconnectRedis: jest.fn(async () => {
      order.push("redis");
    }),
    closeDatabase: jest.fn(async () => {
      order.push("database");
    }),
  };
  return { steps: buildWorkerShutdownSteps(() => deps), consumer, deps, order };
};

describe("the worker's shutdown steps", () => {
  it("drains the consumers on a clean stop, then closes everything it opened, Redis included", async () => {
    const { steps, consumer, deps, order } = build();

    await steps(0);

    expect(consumer.close).toHaveBeenCalledWith(WORKER_DRAIN_TIMEOUT_MS);
    expect(deps.disconnectRedis).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      "consumers",
      "consumers",
      "publisher",
      "rabbitmq",
      "redis",
      "database",
    ]);
  });

  it("closes the consumers without draining after a crash", async () => {
    const { steps, consumer, deps } = build();

    await steps(1);

    expect(consumer.close).toHaveBeenCalledWith(0);
    expect(deps.disconnectRedis).toHaveBeenCalledTimes(1);
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
  });

  // #313 (audit 2026-11-14 Y62), review M1: the flush is createShutdown's, so it runs
  // after a step that throws, and when the deadline passes.
  it("sends Sentry's reports with the logs, even when a close step throws", async () => {
    const order: string[] = [];
    const flushErrorReports = jest.fn(async (timeoutMs: number) => {
      void timeoutMs;
      order.push("sentry");
    });
    const flushLogs = jest.fn(async () => {
      order.push("logs");
    });
    const exit = jest.fn();
    const { deps } = build();
    deps.closeDatabase.mockRejectedValueOnce(new Error("database gone"));

    const shutdown = createShutdown({
      label: "WORKER",
      steps: buildWorkerShutdownSteps(() => deps),
      flush: buildWorkerFlush({ flushLogs, flushErrorReports }),
      exit,
    });
    await shutdown("uncaughtException", 1);

    expect(flushErrorReports).toHaveBeenCalledWith(ERROR_REPORT_FLUSH_MS);
    expect(order).toEqual(expect.arrayContaining(["sentry", "logs"]));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("flushes the logs when Sentry's flush fails", async () => {
    const flushLogs = jest.fn(async () => undefined);
    const flush = buildWorkerFlush({
      flushLogs,
      flushErrorReports: async () => {
        throw new Error("transport down");
      },
    });
    await expect(flush()).resolves.toBeUndefined();
    expect(flushLogs).toHaveBeenCalledTimes(1);
  });
});
