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
import logger from "@/utils/logger.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";

// const metricSettingsCacheKey = (req: AuthRequest) =>
//   `metricSettings:${req.user?.id}:${req.query.metricId || "all"}`;

const metricSettingCacheKey = (req: AuthRequest) =>
  `metricSetting:${req.user?.organizationId}:${req.user?.id}:${req.params.id}`;

const firstNonEmpty = (...vals: unknown[]) =>
  vals.find((v) => typeof v === "string" && v.trim().length > 0) as
    | string
    | undefined;

const bool01 = (v: unknown) => (v === true || v === "true" ? "1" : "0");

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const METRIC_SETTINGS_CURSOR_FEATURE = "metric-settings";
const METRIC_SETTINGS_CURSOR_VERSION = 2;

const metricSettingsCursorCacheKey = (req: AuthRequest) => {
  const q = req.query;
  const filter =
    (typeof q.filter === "object" && q.filter !== null
      ? (q.filter as Record<string, unknown>)
      : undefined) ?? {};

  const metricId =
    firstNonEmpty(
      asString(filter.metricId),
      asString(q["filter[metricId]"]),
      asString(q.metricId),
      req.params?.metricId,
    ) ?? "_";

  const limit = Number(asString(q.limit) ?? 20);
  const sort = asString(q.sort) ?? "-createdAt";
  const after = asString(q.after) ?? "";
  const it = bool01(q.includeTotal);

  const key = buildCursorCacheKey({
    feature: METRIC_SETTINGS_CURSOR_FEATURE,
    version: METRIC_SETTINGS_CURSOR_VERSION,
    userId: req.user?.id,
    organizationId: req.user?.organizationId,
    segments: [
      ["l", limit],
      ["s", sort],
      ["fm", metricId],
      ["after", after],
      ["it", it],
    ],
  });

  logger.debug("[CACHE] Generated metric settings cursor key", { key });
  return key;
};

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

export const metricSettingsRouter = createMetricSettingsRouter();
