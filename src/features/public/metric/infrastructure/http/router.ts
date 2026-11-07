import { Router } from "express";
import { z } from "zod";
import { createMetricController } from "./controller.js";
import { authMiddleware } from "@/features/auth/public.js";
import { cacheMiddleware } from "@/shared/middleware/cache.js";
import { userRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { validate } from "@/shared/middleware/validation.js";
import {
  createMetricSchema,
  updateMetricSchema,
  deleteMetricSchema,
  getMetricSchema,
  generateDummyMetricsSchema,
  getAllMetricsViaCursorSchema,
} from "./schema.zod.js";
import { env } from "@/config/envManager.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";
import { metricDetailCacheKey, metricsCursorCacheKey } from "./cache-keys.js";

export const createMetricRouter = (
  deps: Parameters<typeof createMetricController>[0],
) => {
  const controller = createMetricController(deps);
  const router = Router();
  router.use(authMiddleware);

  router.post(
    "/",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createMetricSchema),
    controller.createMetric,
  );

  router.get(
    "/",
    validate(getAllMetricsViaCursorSchema),
    cacheMiddleware(metricsCursorCacheKey, 60),
    controller.getUserMetricLibrariesViaCursor,
  );

  router.get(
    "/:id",
    validate(getMetricSchema),
    cacheMiddleware(metricDetailCacheKey, 60),
    controller.getUserDetailMetricById,
  );

  router.put(
    "/:id",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateMetricSchema),
    controller.updateMetric,
  );

  router.delete(
    "/:id",
    userRateLimiter,
    validate(deleteMetricSchema),
    controller.deleteMetric,
  );

  const trendParams = { params: z.object({ metricId: z.string().guid() }) };
  router.get(
    "/:metricId/trends",
    validate(trendParams),
    controller.handleMetricTrend,
  );

  if (env.ENABLE_DUMMY_ENDPOINTS) {
    router.post(
      "/dummy",
      userRateLimiter,
      requireJsonObjectBody(),
      validate(generateDummyMetricsSchema),
      controller.generateDummyMetrics,
    );
    router.all("/dummy", methodNotAllowed(["POST"]));
  }

  router.all("/", methodNotAllowed(["GET", "POST"]));
  router.all("/:id", methodNotAllowed(["GET", "PUT", "DELETE"]));
  router.all("/:metricId/trends", methodNotAllowed(["GET"]));

  return router;
};
