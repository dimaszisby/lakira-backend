import { Router } from "express";
import {
  createMetricSettings,
  getMetricSettingsById,
  updateMetricSettings,
  deleteMetricSettings,
  updateGoalAchievement,
  updateDisplayOptions,
  getAllMetricSettingsViaCursor,
} from "./controller.js";
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

export const createMetricSettingsRouter = () => {
  const router = Router();
  router.use(authMiddleware);

  router.get(
    "/",
    validate(listMetricSettingsViaCursorSchema),
    cacheMiddleware(metricSettingsCursorCacheKey, 300),
    getAllMetricSettingsViaCursor,
  );

  router.get(
    "/:id",
    validate(getMetricSettingsSchema),
    cacheMiddleware(metricSettingCacheKey, 300),
    getMetricSettingsById,
  );

  router.post(
    "/",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createMetricSettingsSchema),
    createMetricSettings,
  );

  router.put(
    "/:id",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateMetricSettingsSchema),
    updateMetricSettings,
  );

  router.delete(
    "/:id",
    userRateLimiter,
    validate(deleteMetricSettingsSchema),
    deleteMetricSettings,
  );

  router.patch(
    "/:id/achieve",
    userRateLimiter,
    validate(goalAchievementSchema),
    updateGoalAchievement,
  );

  router.patch(
    "/:id/display",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateDisplayOptionsSchema),
    updateDisplayOptions,
  );

  router.all("/", methodNotAllowed(["GET", "POST"]));
  router.all("/:id", methodNotAllowed(["GET", "PUT", "DELETE"]));
  router.all("/:id/achieve", methodNotAllowed(["PATCH"]));
  router.all("/:id/display", methodNotAllowed(["PATCH"]));

  return router;
};
