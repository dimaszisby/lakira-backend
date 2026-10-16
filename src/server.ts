import express, { Application } from "express";
import { env, loadEnvOrExit } from "./config/envManager.js";
import http from "http";
import swaggerUi from "swagger-ui-express";
import { getOpenApiDocumentation } from "./lib/openapi/openapi-docs.js";
import logger, { flushLogs } from "@/utils/logger.js";
import { APP_NAME } from "@/config/app-name.js";

// Routes
// Routers are built here, at mount time — importing a feature constructs nothing (ADR-0045).
import {
  createAuthRouter,
  createOrganizationRouter,
  createInviteRouter,
  createMembershipRouter,
} from "./features/shared/auth/index.js";
import { createMetricRouter } from "./features/public/metric/index.js";
import { createMetricLogRouter } from "./features/public/metric-log/index.js";
import { createMetricSettingsRouter } from "./features/public/metric-settings/index.js";
import { createMetricCategoryRouter } from "./features/public/metric-category/index.js";
import { createVisualizationRouter } from "./features/public/analytics/index.js";
import { installMetricLogFeature } from "./features/public/metric-log/infrastructure/http/controller.js";
import { buildWiredMetricLogFeature } from "./composition/metric-log.js";

// Other Setup
import { globalRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { mountHttpPipeline } from "@/shared/middleware/http-pipeline.js";
import { notFoundHandler } from "@/shared/middleware/not-found.js";
import { createReadinessProbe } from "@/shared/utils/readiness-probe.js";
import { errorHandler } from "@/shared/middleware/error.js";
import { disconnectRedis, redisClient } from "./utils/redis-client.js";
import {
  connectRabbitMQ,
  disconnectRabbitMQ,
} from "./shared/infrastructure/queue/RabbitMQConnection.js";
import { RabbitMQPublisher } from "./shared/infrastructure/queue/RabbitMQPublisher.js";
import sequelize from "./config/db.js";
import { loadModels } from "./infrastructure/db/models.js";
import { authMiddleware } from "./features/shared/auth/infrastructure/http/authMiddleware.js";
import { requireOrgRole } from "./features/shared/auth/infrastructure/http/assertHasOrgRole.js";
import { sendError } from "@/shared/utils/error-envelope.js";
import { attachClientErrorHandler } from "@/shared/middleware/client-error.js";
import * as Sentry from "@sentry/node";
import { SENTRY_SCRUB_HOOKS } from "./utils/sentry-scrub.js";
import {
  SHUTDOWN_DRAIN_TIMEOUT_MS,
  drainBackgroundTasks,
  pendingBackgroundTaskCount,
} from "./utils/background-tasks.js";

installMetricLogFeature(
  buildWiredMetricLogFeature({
    messageQueue: env.RABBITMQ_ENABLED ? new RabbitMQPublisher() : undefined,
  }),
);

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    environment: env.NODE_ENV,
    release: env.APP_RELEASE,
    // sendDefaultPii defaults to false, but the SDK still attaches the request URL
    // with its query string, the request headers and an error's message. These
    // clean all three, and what application code passes.
    // Transactions, spans and logs never reach beforeSend, so each has its own
    // hook. Logs are off; their hook is set so turning them on cannot skip it.
    ...SENTRY_SCRUB_HOOKS,
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

const skipDbBootstrap = env.SKIP_DB_LIFECYCLE;
const initialDbBootstrap = async () => {
  if (!skipDbBootstrap) {
    loadModels();
    await sequelize.authenticate();
  } else {
    logger.info(
      "[SERVER] SKIP_DB_LIFECYCLE enabled — skipping initial DB bootstrap.",
    );
  }
};

const serverBootstrapPromise = initialDbBootstrap().catch((error) => {
  logger.error("[SERVER] Initial database bootstrap failed.", error);
  throw error;
});
export const serverReady = serverBootstrapPromise;

// * Environment Variables

const app: Application = express();
app.set("trust proxy", env.TRUST_PROXY ?? 1);

// * Middlewares
// The order is in one place, mountHttpPipeline (ADR-0061). The probes are handed to
// it so that it can place them: ahead of the limiter, so a platform probe is never
// throttled, and ahead of the body parsers, so a probe parses nothing.
const corsOrigins = loadEnvOrExit().CORS_ORIGIN ?? ["http://localhost:3000"];

const mountProbes = (probed: Application): void => {
  // Health check — registered before rate limiter so probes are never throttled
  probed.get("/api/v1/health", (_req, res) => {
    res.json({
      status: "ok",
      environment: env.NODE_ENV,
      release: env.APP_RELEASE,
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness probe: the database and Redis, each with a 2 s budget. It stays ahead of
  // the rate limiter so a platform probe is never throttled, and its result is held for
  // 2 s so that a flood of calls costs one check per window, not one each.
  const readinessProbe = createReadinessProbe({
    checks: {
      db: () => sequelize.authenticate(),
      redis: () => redisClient.ping(),
    },
    timeoutMs: 2000,
    windowMs: 2000,
  });

  probed.get("/api/v1/ready", (_req, res) => {
    void readinessProbe()
      .then(({ ok, checks }) => {
        res.status(ok ? 200 : 503).json({
          status: ok ? "ok" : "degraded",
          checks,
        });
      })
      .catch(() => {
        sendError(res, 500, "Readiness check failed");
      });
  });
};

mountHttpPipeline(app, {
  limiter: globalRateLimiter,
  corsOrigins,
  bodyLimit: env.REQUEST_BODY_LIMIT,
  redirectToHttps: env.NODE_ENV === "production",
  mountProbes,
});

// * Routes
app.use("/api/v1/auth", createAuthRouter());
app.use("/api/v1/organizations", createOrganizationRouter());
app.use("/api/v1/invites", createInviteRouter());
app.use("/api/v1/memberships", createMembershipRouter());
app.use("/api/v1/metrics", createMetricRouter());
app.use("/api/v1/metric-categories", createMetricCategoryRouter());
app.use("/api/v1/metric-settings", createMetricSettingsRouter());
app.use("/api/v1/metric-logs", createMetricLogRouter());
// DDD based routes
app.use("/api/v1/analytics", createVisualizationRouter());

// * Admin routes — guarded by authMiddleware + org role check
const adminRouter = express.Router();
adminRouter.use(authMiddleware, requireOrgRole("admin", "owner"));
adminRouter.get("/_ping", (_req, res) =>
  res.json({ status: "ok", scope: "admin" }),
);
app.use("/api/v1/admin", adminRouter);

// Serve OpenAPI documentation
// TODO: Developer Note -> Learn more about OpenAPI and Swagger integration
const openApiDocument = getOpenApiDocumentation();
const swaggerGuards = env.SWAGGER_REQUIRE_AUTH ? [authMiddleware] : [];

// Raw OpenAPI JSON endpoint for tooling/codegen
app.get("/api/v1/docs/openapi.json", ...swaggerGuards, (_req, res) => {
  res.json(openApiDocument);
});

app.use(
  "/api/v1/docs",
  ...swaggerGuards,
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument),
);

// * Unmatched routes, then the global error handler
app.use(notFoundHandler);
app.use(errorHandler);

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
 * - Drain background tasks (ADR-0054)
 * - Close DB connection
 * - Close Express server
 * - Log shutdown
 */
const shutdown = async (signal: string, exitCode = 0) => {
  logger.info(`\n[SERVER] Received ${signal}, initiating shutdown...`);

  try {
    if (server) {
      logger.info("[SERVER] Closing HTTP server...");
      await new Promise((resolve) => server!.close(resolve));
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

    logger.info("[SERVER] Cleanup completed. Exiting.");
  } catch (error) {
    logger.error("[SERVER] during shutdown:", error);
    exitCode = exitCode || 1;
  }

  await flushLogs();
  process.exit(exitCode);
};

// Handle termination signals
["SIGTERM", "SIGINT"].forEach((signal) =>
  process.on(signal, () => shutdown(signal)),
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

startServer();

export default app;
