import { Router } from "express";
import { createMetricLogController } from "./controller.js";
import {
  metricLogCacheKey,
  metricLogStatsCacheKey,
  metricLogsCursorCacheKey,
} from "./cache-keys.js";
import type { MetricLogFeature } from "../../feature.js";
import { authMiddleware } from "@/features/auth/public.js";
import { cacheMiddleware } from "@/shared/middleware/cache.js";
import { userRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { validate } from "@/shared/middleware/validation.js";
import {
  createMetricLogSchema,
  updateMetricLogSchema,
  getMetricLogByIdSchema,
  deleteMetricLogSchema,
  getAggregatedStatsSchema,
  generateDummyMetricLogsSchema,
  listMetricLogsViaCursorSchema,
} from "./schema.zod.js";
import { env } from "@/config/envManager.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";

export const createMetricLogRouter = (feature: MetricLogFeature) => {
  const controller = createMetricLogController(feature);
  const router = Router();
  router.use(authMiddleware);

  router.get(
    "/",
    validate(listMetricLogsViaCursorSchema),
    cacheMiddleware(metricLogsCursorCacheKey, 300),
    controller.getUserLogLibrariesViaCursor,
  );

  router
    .route("/stats")
    .get(
      validate(getAggregatedStatsSchema),
      cacheMiddleware(metricLogStatsCacheKey, 300),
      controller.getAggregatedStats,
    )
    .all(methodNotAllowed(["GET"]));

  router.get(
    "/:id",
    validate(getMetricLogByIdSchema),
    cacheMiddleware(metricLogCacheKey, 300),
    controller.getLogById,
  );

  router.post(
    "/",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createMetricLogSchema),
    controller.createMetricLog,
  );

  router.put(
    "/:id",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateMetricLogSchema),
    controller.updateLog,
  );

  router.delete(
    "/:id",
    userRateLimiter,
    validate(deleteMetricLogSchema),
    controller.deleteLog,
  );

  if (env.ENABLE_DUMMY_ENDPOINTS) {
    router.post(
      "/:metricId/dummy",
      userRateLimiter,
      requireJsonObjectBody(),
      validate(generateDummyMetricLogsSchema),
      controller.generateDummyMetricLogs,
    );
    router.all("/:metricId/dummy", methodNotAllowed(["POST"]));
  }

  router.all("/", methodNotAllowed(["GET", "POST"]));
  router.all("/:id", methodNotAllowed(["GET", "PUT", "DELETE"]));

  return router;
};
