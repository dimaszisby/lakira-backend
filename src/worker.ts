import { env } from "./config/envManager.js";
import logger, { flushLogs, logUnhandledRejection } from "./utils/logger.js";
import {
  connectRabbitMQ,
  disconnectRabbitMQ,
} from "./shared/infrastructure/queue/RabbitMQConnection.js";
import { RabbitMQConsumer } from "./shared/infrastructure/queue/RabbitMQConsumer.js";
import { RabbitMQPublisher } from "./shared/infrastructure/queue/RabbitMQPublisher.js";
import { QUEUES } from "./shared/infrastructure/queue/topology.js";
import { loadModels } from "./infrastructure/db/models.js";
import sequelize from "./config/db.js";
import { buildWiredMetricLogFeature } from "./composition/metric-log.js";
import { buildWiredAuthFeature } from "./composition/auth.js";
import { createShutdown } from "./utils/shutdown.js";
import { disconnectRedis } from "./utils/redis-client.js";
import { buildWorkerShutdownSteps } from "./worker-shutdown.js";
import { currentAppNameMismatch } from "./config/app-name.js";

if (!env.RABBITMQ_ENABLED) {
  logger.error(
    "[WORKER] RABBITMQ_ENABLED is false. Set it to true to run the worker.",
  );
  // The line above is why it exits; flushed first, or it can be lost (audit X65).
  await flushLogs();
  process.exit(1);
}

const workers: RabbitMQConsumer[] = [];
// Consumers republish failed messages for retry; closed only after they drain.
let retryPublisher: RabbitMQPublisher | null = null;

const startWorker = async (): Promise<void> => {
  logger.info("[WORKER] Starting...");
  // The queue names follow the app's name (app-name-review-leftovers D-03).
  const nameMismatch = currentAppNameMismatch();
  if (nameMismatch) {
    logger.warn(
      `[WORKER] APP_NAME "${nameMismatch.appName}" differs from the package name "${nameMismatch.packageName}"; the queues are named after "${nameMismatch.appName}"`,
      nameMismatch,
    );
  }

  loadModels();
  await sequelize.authenticate();
  logger.info("[WORKER] Database connected.");

  connectRabbitMQ();
  logger.info("[WORKER] RabbitMQ connection initiated.");

  // --- Consumers ---

  // Handlers come from the feature, wired as the HTTP server wires it (ADR-0056).
  const { dummyLogsHandler } = buildWiredMetricLogFeature();
  const {
    sendVerificationEmailHandler,
    sendPasswordResetEmailHandler,
    sendInviteEmailHandler,
  } = buildWiredAuthFeature();

  retryPublisher = new RabbitMQPublisher();

  workers.push(
    new RabbitMQConsumer({
      queue: QUEUES.METRIC_LOG_GENERATE_DUMMY,
      handler: (msg, context) => dummyLogsHandler.handle(msg, context),
      publisher: retryPublisher,
    }),
    // The verification email (ADR-0067).
    new RabbitMQConsumer({
      queue: QUEUES.AUTH_SEND_VERIFICATION_EMAIL,
      handler: (msg, context) =>
        sendVerificationEmailHandler.handle(msg, context),
      publisher: retryPublisher,
    }),
    // The password-reset email (ADR-0069).
    new RabbitMQConsumer({
      queue: QUEUES.AUTH_SEND_PASSWORD_RESET_EMAIL,
      handler: (msg, context) =>
        sendPasswordResetEmailHandler.handle(msg, context),
      publisher: retryPublisher,
    }),
    // The invite email (ADR-0070).
    new RabbitMQConsumer({
      queue: QUEUES.AUTH_SEND_INVITE_EMAIL,
      handler: (msg, context) => sendInviteEmailHandler.handle(msg, context),
      publisher: retryPublisher,
    }),
  );

  logger.info("[WORKER] Ready. Waiting for messages.");
};

// Runs once, within one deadline, logs flushed before exit (ADR-0076). The
// drain is bounded so the closes after it still fit, and skipped after a crash.
const shutdown = createShutdown({
  label: "WORKER",
  steps: buildWorkerShutdownSteps(() => ({
    consumers: workers,
    retryPublisher,
    disconnectRabbitMQ,
    disconnectRedis,
    closeDatabase: () => sequelize.close(),
  })),
});

// Nothing awaits shutdown: it handles its own failure and ends the process.
["SIGTERM", "SIGINT"].forEach((signal) =>
  process.on(signal, () => {
    void shutdown(signal);
  }),
);

process.on("uncaughtException", (error) => {
  logger.error("[WORKER] Uncaught exception:", error);
  void shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  logUnhandledRejection("[WORKER]", reason);
  void shutdown("unhandledRejection", 1);
});

startWorker().catch(async (error) => {
  logger.error("[WORKER] Failed to start:", error);
  await flushLogs();
  process.exit(1);
});
