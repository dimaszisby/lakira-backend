import { Router } from "express";
import { createAnalyticsController } from "./controller.js";
import type { AnalyticsFeature } from "../../feature.js";
import { authMiddleware } from "@/features/auth/public.js";
import { validate } from "@/shared/middleware/validation.js";
import { getDashboardVizSchema, getVisualizationSchema } from "./schema.zod.js";
import catchAsync from "@/utils/catch-async.js";
import { analyticsRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";

export const createVisualizationRouter = (feature: AnalyticsFeature) => {
  const controller = createAnalyticsController(feature);
  const router = Router();

  router.use(authMiddleware);

  router.get(
    "/dashboard",
    analyticsRateLimiter,
    validate(getDashboardVizSchema),
    catchAsync(controller.handleGetDashboardVisualization),
  );

  router.get(
    "/metrics/:metricId",
    analyticsRateLimiter,
    validate(getVisualizationSchema),
    catchAsync(controller.handleGetVisualization),
  );

  router.all("/dashboard", methodNotAllowed(["GET"]));
  router.all("/metrics/:metricId", methodNotAllowed(["GET"]));

  return router;
};
