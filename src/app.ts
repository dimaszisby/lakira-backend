import express, { Application } from "express";
import swaggerUi from "swagger-ui-express";
import { env, loadEnvOrExit } from "./config/envManager.js";
import { getOpenApiDocumentation } from "./lib/openapi/openapi-docs.js";
import type { AppFeatures } from "./composition/features.js";

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

// Other Setup
import { globalRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { mountHttpPipeline } from "@/shared/middleware/http-pipeline.js";
import { notFoundHandler } from "@/shared/middleware/not-found.js";
import { createReadinessProbe } from "@/shared/utils/readiness-probe.js";
import { errorHandler } from "@/shared/middleware/error.js";
import { redisClient } from "./utils/redis-client.js";
import sequelize from "./config/db.js";
import { authMiddleware } from "./features/shared/auth/infrastructure/http/authMiddleware.js";
import { requireOrgRole } from "./features/shared/auth/infrastructure/http/assertHasOrgRole.js";
import { sendError } from "@/shared/utils/error-envelope.js";

// Built on the first app, and shared: the spec is the same for every app.
let openApiDocumentCache:
  | ReturnType<typeof getOpenApiDocumentation>
  | undefined;

/**
 * The HTTP app, from the global middleware to the error handler, serving the
 * features it is handed (ADR-0072). `src/server.ts` builds the one the process
 * listens on; a test builds its own when it needs a different feature, and so never
 * changes what another test sees. Nothing here listens, connects or reads a body.
 */
export const createApp = (features: AppFeatures): Application => {
  const app: Application = express();
  app.set("trust proxy", env.TRUST_PROXY);

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
    requireHttps: env.NODE_ENV === "production",
    mountProbes,
  });

  // * Routes
  app.use("/api/v1/auth", createAuthRouter(features.auth));
  app.use("/api/v1/organizations", createOrganizationRouter(features.auth));
  app.use("/api/v1/invites", createInviteRouter(features.auth));
  app.use("/api/v1/memberships", createMembershipRouter(features.auth));
  app.use(
    "/api/v1/metrics",
    createMetricRouter({
      metric: features.metric,
      metricTrend: features.analytics.getMetricTrend,
    }),
  );
  app.use(
    "/api/v1/metric-categories",
    createMetricCategoryRouter(features.metricCategory),
  );
  app.use(
    "/api/v1/metric-settings",
    createMetricSettingsRouter(features.metricSettings),
  );
  app.use("/api/v1/metric-logs", createMetricLogRouter(features.metricLog));
  // DDD based routes
  app.use("/api/v1/analytics", createVisualizationRouter(features.analytics));

  // * Admin routes — guarded by authMiddleware + org role check
  const adminRouter = express.Router();
  adminRouter.use(authMiddleware, requireOrgRole("admin", "owner"));
  adminRouter.get("/_ping", (_req, res) =>
    res.json({ status: "ok", scope: "admin" }),
  );
  app.use("/api/v1/admin", adminRouter);

  // Serve OpenAPI documentation
  // TODO: Developer Note -> Learn more about OpenAPI and Swagger integration
  const openApiDocument = (openApiDocumentCache ??= getOpenApiDocumentation());
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

  return app;
};
