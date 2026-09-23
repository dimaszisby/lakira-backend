import { Router } from "express";
import {
  handleGetDashboardVisualization,
  handleGetVisualization,
} from "./controller.js";
import { authMiddleware } from "@/features/auth/public.js";
import { validate } from "@/shared/middleware/validation.js";
import { getDashboardVizSchema, getVisualizationSchema } from "./schema.zod.js";
import catchAsync from "@/utils/catch-async.js";
import { analyticsRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";

const router = Router();

router.use(authMiddleware);

router.get(
  "/dashboard",
  analyticsRateLimiter,
  validate(getDashboardVizSchema),
  catchAsync(handleGetDashboardVisualization),
);

router.get(
  "/metrics/:metricId",
  analyticsRateLimiter,
  validate(getVisualizationSchema),
  catchAsync(handleGetVisualization),
);

router.all("/dashboard", methodNotAllowed(["GET"]));
router.all("/metrics/:metricId", methodNotAllowed(["GET"]));

export { router as visualizationRouter };
