import { env } from "./config/envManager.js";
import logger, { flushLogs } from "./utils/logger.js";
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
import { WORKER_DRAIN_TIMEOUT_MS, createShutdown } from "./utils/shutdown.js";

if (!env.RABBITMQ_ENABLED) {
  logger.error(
    "[WORKER] RABBITMQ_ENABLED is false. Set it to true to run the worker.",
  );
  process.exit(1);
}

const workers: RabbitMQConsumer[] = [];
// Consumers republish failed messages for retry; closed only after they drain.
let retryPublisher: RabbitMQPublisher | null = null;

const startWorker = async (): Promise<void> => {
  logger.info("[WORKER] Starting...");

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
// drain is bounded so the closes after it still fit.
const shutdown = createShutdown({
  label: "WORKER",
  steps: async () => {
    await Promise.all(workers.map((w) => w.close(WORKER_DRAIN_TIMEOUT_MS)));
    logger.info("[WORKER] All consumers drained.");

    await retryPublisher?.close();

    await disconnectRabbitMQ();
    logger.info("[WORKER] RabbitMQ disconnected.");

    await sequelize.close();
    logger.info("[WORKER] Database disconnected.");
  },
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
  logger.error("[WORKER] Unhandled rejection:", reason);
  void shutdown("unhandledRejection", 1);
});

startWorker().catch(async (error) => {
  logger.error("[WORKER] Failed to start:", error);
  await flushLogs();
  process.exit(1);
});
