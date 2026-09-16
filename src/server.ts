import express, { Application } from "express";
import { env, loadEnvOrExit } from "./config/envManager.js";
import cors from "cors";
import helmet from "helmet";
import xssClean from "xss-clean";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import http from "http";
import swaggerUi from "swagger-ui-express";
import { getOpenApiDocumentation } from "./lib/openapi/openapi-docs.js";
import logger, { flushLogs } from "@/utils/logger.js";
import { APP_NAME } from "@/config/app-name.js";

// Routes
import {
  authRouter,
  organizationRouter,
  inviteRouter,
  membershipRouter,
} from "./features/shared/auth/index.js";
import { metricRouter } from "./features/public/metric/index.js";
import { metricLogRouter } from "./features/public/metric-log/index.js";
import { metricSettingsRouter } from "./features/public/metric-settings/index.js";
import { metricCategoryRouter } from "./features/public/metric-category/index.js";
import { visualizationRouter } from "@/features/analytics/infrastructure/http/router.js";
import { buildMetricLogFeature } from "./features/public/metric-log/feature.js";
import { overrideMetricLogFeatureForTest } from "./features/public/metric-log/infrastructure/http/controller.js";
import { AnalyticsVisualizationInvalidationAdapter } from "./features/public/analytics/infrastructure/cache/VisualizationInvalidationAdapter.js";

// Other Setup
import { globalRateLimiter } from "@/shared/middleware/rate-limiter.js";
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
import { disallowTraceMethod } from "@/shared/middleware/method-guard.js";
import { requestIdMiddleware } from "@/shared/middleware/request-id.js";
import { accessLogMiddleware } from "@/shared/middleware/access-log.js";
import { sendError } from "@/shared/utils/error-envelope.js";
import { attachClientErrorHandler } from "@/shared/middleware/client-error.js";
import * as Sentry from "@sentry/node";

const visualizationInvalidationAdapter =
  new AnalyticsVisualizationInvalidationAdapter();
overrideMetricLogFeatureForTest(
  buildMetricLogFeature({
    visualizationInvalidator: visualizationInvalidationAdapter,
    messageQueue: env.RABBITMQ_ENABLED ? new RabbitMQPublisher() : undefined,
  }),
);

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    environment: env.NODE_ENV,
    release: env.APP_RELEASE,
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
app.use(
  express.json({
    limit: env.REQUEST_BODY_LIMIT,
    strict: false, // allow primitives + guard downstream to emit cleaner 400s
  }),
);

// Cookie parser — before routes so req.cookies is populated
app.use(cookieParser());

// Request-ID — propagate x-request-id through AsyncLocalStorage so every log line is correlated
app.use(requestIdMiddleware);

// HTTP access logging — after requestIdMiddleware so each line carries the same
// requestId as the application logs for that request (ADR-0041).
app.use(accessLogMiddleware);

// Security Enhancements
app.use(helmet()); // Secure HTTP headers

// HTTPS redirect — after helmet() so the 301 response includes HSTS and other security headers
if (env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (!req.secure && req.get("x-forwarded-proto") !== "https") {
      return res.redirect(
        301,
        `https://${req.headers.host ?? ""}${req.originalUrl}`,
      );
    }
    next();
  });
}
app.use(xssClean()); // Prevent XSS attacks
app.use(hpp()); // Prevent HTTP Parameter Pollution

// Disallow TRACE (and similar unsupported verbs) globally so contracts receive 405 responses.
app.use(disallowTraceMethod);

// Configure CORS
const corsOrigins = loadEnvOrExit().CORS_ORIGIN ?? ["http://localhost:3000"];
app.use(
  cors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true, // Allow cookies and auth headers
  }),
);

// Health check — registered before rate limiter so probes are never throttled
app.get("/api/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    environment: env.NODE_ENV,
    release: env.APP_RELEASE,
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe — checks both DB and Redis with a 2 s budget
app.get("/api/v1/ready", (_req, res) => {
  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), ms),
      ),
    ]);

  void Promise.allSettled([
    withTimeout(sequelize.authenticate(), 2000),
    withTimeout(redisClient.ping(), 2000),
  ])
    .then(([dbResult, redisResult]) => {
      const dbStatus = dbResult.status === "fulfilled" ? "ok" : "fail";
      const redisStatus = redisResult.status === "fulfilled" ? "ok" : "fail";
      const allOk = dbStatus === "ok" && redisStatus === "ok";

      res.status(allOk ? 200 : 503).json({
        status: allOk ? "ok" : "degraded",
        checks: { db: dbStatus, redis: redisStatus },
      });
    })
    .catch(() => {
      sendError(res, 500, "Readiness check failed");
    });
});

// Global Rate Limiter
app.use(globalRateLimiter);

// * Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/organizations", organizationRouter);
app.use("/api/v1/invites", inviteRouter);
app.use("/api/v1/memberships", membershipRouter);
app.use("/api/v1/metrics", metricRouter);
app.use("/api/v1/metric-categories", metricCategoryRouter);
app.use("/api/v1/metric-settings", metricSettingsRouter);
app.use("/api/v1/metric-logs", metricLogRouter);
// DDD based routes
app.use("/api/v1/analytics", visualizationRouter);

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

// * Global Error Handler
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
