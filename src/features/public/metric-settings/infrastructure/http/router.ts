import { Router } from "express";
import { createMetricSettingsController } from "./controller.js";
import type { MetricSettingsFeature } from "../../feature.js";
import { authMiddleware } from "@/features/auth/public.js";
import { cacheMiddleware } from "@/shared/middleware/cache.js";
import { userRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { validate } from "@/shared/middleware/validation.js";
import {
  createMetricSettingsSchema,
  updateMetricSettingsSchema,
  getMetricSettingsSchema,
  deleteMetricSettingsSchema,
  listMetricSettingsViaCursorSchema,
  updateDisplayOptionsSchema,
  goalAchievementSchema,
} from "./schema.zod.js";
import { AuthRequest } from "@/types/request.context.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";
import { metricSettingsCursorCacheKey } from "./cache-keys.js";

// const metricSettingsCacheKey = (req: AuthRequest) =>
//   `metricSettings:${req.user?.id}:${req.query.metricId || "all"}`;

const metricSettingCacheKey = (req: AuthRequest) =>
  `metricSetting:${req.user?.organizationId}:${req.user?.id}:${req.params.id}`;

export const createMetricSettingsRouter = (feature: MetricSettingsFeature) => {
  const controller = createMetricSettingsController(feature);
  const router = Router();
  router.use(authMiddleware);

  router.get(
    "/",
    validate(listMetricSettingsViaCursorSchema),
    cacheMiddleware(metricSettingsCursorCacheKey, 300),
    controller.getAllMetricSettingsViaCursor,
  );

  router.get(
    "/:id",
    validate(getMetricSettingsSchema),
    cacheMiddleware(metricSettingCacheKey, 300),
    controller.getMetricSettingsById,
  );

  router.post(
    "/",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createMetricSettingsSchema),
    controller.createMetricSettings,
  );

  router.put(
    "/:id",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateMetricSettingsSchema),
    controller.updateMetricSettings,
  );

  router.delete(
    "/:id",
    userRateLimiter,
    validate(deleteMetricSettingsSchema),
    controller.deleteMetricSettings,
  );

  router.patch(
    "/:id/achieve",
    userRateLimiter,
    validate(goalAchievementSchema),
    controller.updateGoalAchievement,
  );

  router.patch(
    "/:id/display",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateDisplayOptionsSchema),
    controller.updateDisplayOptions,
  );

  router.all("/", methodNotAllowed(["GET", "POST"]));
  router.all("/:id", methodNotAllowed(["GET", "PUT", "DELETE"]));
  router.all("/:id/achieve", methodNotAllowed(["PATCH"]));
  router.all("/:id/display", methodNotAllowed(["PATCH"]));

  return router;
};
