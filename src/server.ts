import { env } from "./config/envManager.js";
import http from "http";
import logger from "@/utils/logger.js";
import { APP_NAME } from "@/config/app-name.js";

// The app and its features: every feature built once, here, and handed to its
// router (ADR-0072). Importing a feature constructs nothing (ADR-0045).
import { createApp } from "./app.js";
import { buildWiredFeatures } from "./composition/features.js";

// Other Setup
import { disconnectRedis } from "./utils/redis-client.js";
import {
  connectRabbitMQ,
  disconnectRabbitMQ,
} from "./shared/infrastructure/queue/RabbitMQConnection.js";
import { RabbitMQPublisher } from "./shared/infrastructure/queue/RabbitMQPublisher.js";
import sequelize from "./config/db.js";
import { loadModels } from "./infrastructure/db/models.js";
import { attachClientErrorHandler } from "@/shared/middleware/client-error.js";
import * as Sentry from "@sentry/node";
import {
  SENTRY_DATA_COLLECTION,
  SENTRY_SCRUB_HOOKS,
} from "./utils/sentry-scrub.js";
import {
  SHUTDOWN_DRAIN_TIMEOUT_MS,
  drainBackgroundTasks,
  pendingBackgroundTaskCount,
} from "./utils/background-tasks.js";
import { closeHttpServer, createShutdown } from "./utils/shutdown.js";

// One publisher for every feature that queues work.
const messageQueue = env.RABBITMQ_ENABLED ? new RabbitMQPublisher() : undefined;
const features = buildWiredFeatures({ messageQueue });

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    environment: env.NODE_ENV,
    release: env.APP_RELEASE,
    // Sentry 11 collects every data category it is not told to leave alone; each
    // is named and off (ADR-0071). The hooks then clean an error's message and
    // what application code passes. Spans and logs never reach beforeSend, so each
    // has its own hook; the app sends no logs, and the hook is set so starting to
    // cannot skip it.
    dataCollection: SENTRY_DATA_COLLECTION,
    ...SENTRY_SCRUB_HOOKS,
    // Pinned, not inherited: the span hook is written for streamed spans, and a
    // static lifecycle would never call it (sentry-11-data-collection D-03).
    traceLifecycle: "stream",
    // 10's default. 11 turns it on, which attaches a stack to captured messages
    // and changes how issues group (D-05).
    attachStacktrace: false,
    // One capture path for a server error: errorHandler's, which knows a domain
    // error is a 4xx. The integration would capture at the throw, before that
    // handler runs, and send an error with no status code as a 5xx (D-04).
    integrations: [Sentry.expressIntegration({ shouldHandleError: false })],
  });
}

/**
 * * App Entry
 * Execution Flow:
 *  1. Load Env
 *  2. Initializes Middlewares
 *  3. Initializes Routes
 *  4. Initialize Global Error handler
 *  5. Start the server based on config/prompt
 */

// Importing this module opens no connection: startServer checks the database
// before it listens, and jest.setup.ts in its beforeAll. A check started here
// was awaited by nothing, and outlived a test file whose hooks never ran
// (npm-audit-findings D-08).
if (env.SKIP_DB_LIFECYCLE) {
  logger.info(
    "[SERVER] SKIP_DB_LIFECYCLE enabled — skipping initial DB bootstrap.",
  );
} else {
  loadModels();
}

// * Environment Variables

const app = createApp(features);

// HTTP Server Reference
let server: http.Server | null = null;

const startServer = async () => {
  try {
    const isTestEnv = env.NODE_ENV === "test";
    if (isTestEnv && !env.ALLOW_TEST_HTTP_SERVER) {
      logger.info(
        "[SERVER] Running in test environment with ALLOW_TEST_HTTP_SERVER=false. Server bootstrap skipped.",
      );
      return;
    }

    // Authenticate database connection
    await sequelize.authenticate();
    logger.info("[SERVER] Database connection established successfully.");

    if (env.RABBITMQ_ENABLED) {
      connectRabbitMQ();
      logger.info("[SERVER] RabbitMQ connection initiated.");
    }

    // Start HTTP Server
    const PORT = env.PORT || 5000;
    server = app.listen(PORT, () => {
      logger.info(`[SERVER] ${APP_NAME} running on port ${PORT}`);
      // What every per-IP limiter's req.ip depends on (register-rate-limiter D-05).
      // In the message too: the development console prints no metadata.
      const trustProxyHops: unknown = app.get("trust proxy");
      logger.info(`[SERVER] Trusting ${String(trustProxyHops)} proxy hop(s)`, {
        trustProxyHops,
      });
    });
    attachClientErrorHandler(server);
  } catch (error) {
    logger.error("[SERVER ERROR] Server initialization failed:", error);
    process.exit(1);
  }
};

/**
 * Graceful Shutdown Handling
 * - Capture SIGINT & SIGTERM (Docker, PM2, Kubernetes)
 * - Close the HTTP server, cutting connections still open at the bound
 * - Drain background tasks (ADR-0054)
 * - Close DB, Redis and RabbitMQ connections
 * Runs once, within one deadline, logs flushed before exit (ADR-0076).
 */
const shutdown = createShutdown({
  label: "SERVER",
  steps: async (exitCode) => {
    if (server) {
      logger.info("[SERVER] Closing HTTP server...");
      await closeHttpServer(server);
    }

    // Let work started after a response finish while its connections are open
    // Not after a crash: the process state is unknown, so exit promptly.
    if (exitCode === 0) {
      const pendingTasks = pendingBackgroundTaskCount();
      if (pendingTasks > 0) {
        logger.info(
          `[SERVER] Waiting for ${pendingTasks} background task(s)...`,
        );
      }
      await drainBackgroundTasks(SHUTDOWN_DRAIN_TIMEOUT_MS);
    }

    // Close database connection
    logger.info("[SERVER] Closing database connection...");
    await sequelize.close();

    // Close Redis connection
    logger.info("[SERVER] Closing Redis connection...");
    await disconnectRedis();

    // Close RabbitMQ connection
    if (env.RABBITMQ_ENABLED) {
      logger.info("[SERVER] Closing RabbitMQ connection...");
      await disconnectRabbitMQ();
    }
  },
});

// Handle termination signals. Nothing awaits shutdown: it handles its own
// failure and ends the process.
["SIGTERM", "SIGINT"].forEach((signal) =>
  process.on(signal, () => {
    void shutdown(signal);
  }),
);

// Handle uncaught exceptions and promise rejections
process.on("uncaughtException", (error) => {
  logger.error("[SERVER ERROR] Uncaught Exception:", error);
  void shutdown("Uncaught Exception", 1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(
    "[SERVER ERROR] Unhandled Promise Rejection at:",
    promise,
    "reason:",
    reason,
  );
  void shutdown("Unhandled Rejection", 1);
});

// Nothing awaits it: it catches its own failure and exits.
void startServer();

export default app;
