import { Router } from "express";
import {
  createMetricLog,
  getLogById,
  updateLog,
  deleteLog,
  getAggregatedStats,
  generateDummyMetricLogs,
  getUserLogLibrariesViaCursor,
} from "./controller.js";
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
import { AuthRequest } from "@/types/request.context.js";
import { env } from "@/config/envManager.js";
import logger from "@/utils/logger.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";

const firstNonEmpty = (...vals: unknown[]) =>
  vals.find((v) => typeof v === "string" && v.trim().length > 0) as
    | string
    | undefined;

const bool01 = (v: unknown) => (v === true || v === "true" ? "1" : "0");

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asStringOrNumber = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return undefined;
};

const logCacheKey = (req: AuthRequest) =>
  `log:${req.user?.organizationId}:${req.user?.id}:${req.params.id}`;

import {
  METRIC_LOG_CURSOR_FEATURE,
  METRIC_LOG_CURSOR_VERSION,
} from "../../application/cache.constants.js";

const logsCursorCacheKey = (req: AuthRequest) => {
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
    ) ?? "_.js";

  const logValueStr =
    firstNonEmpty(
      asStringOrNumber(filter.logValue),
      asString(q["filter[logValue]"]),
    ) ?? "_.js";

  const limit = Number(asString(q.limit) ?? 20);
  const sort = asString(q.sort) ?? "-createdAt";
  const search = asString(q.q)?.trim() ?? ".js";
  const after = asString(q.after) ?? ".js";
  const it = bool01(q.includeTotal);

  const key = buildCursorCacheKey({
    feature: METRIC_LOG_CURSOR_FEATURE,
    version: METRIC_LOG_CURSOR_VERSION,
    userId: req.user?.id,
    organizationId: req.user?.organizationId,
    segments: [
      ["l", limit],
      ["s", sort],
      ["q", search],
      ["fm", metricId],
      ["fn", logValueStr],
      ["after", after],
      ["it", it],
    ],
  });

  logger.debug("[CACHE] Generated logs cursor key", { key });
  return key;
};

const logStatsCacheKey = (req: AuthRequest) => {
  const metricId = req.params.metricId || req.query.metricId;
  return `logStats:${req.user?.organizationId}:${req.user?.id}:${metricId || "all"}`;
};

export const createMetricLogRouter = () => {
  const router = Router();
  router.use(authMiddleware);

  router.get(
    "/",
    validate(listMetricLogsViaCursorSchema),
    cacheMiddleware(logsCursorCacheKey, 300),
    getUserLogLibrariesViaCursor,
  );

  router
    .route("/stats")
    .get(
      validate(getAggregatedStatsSchema),
      cacheMiddleware(logStatsCacheKey, 300),
      getAggregatedStats,
    )
    .all(methodNotAllowed(["GET"]));

  router.get(
    "/:id",
    validate(getMetricLogByIdSchema),
    cacheMiddleware(logCacheKey, 300),
    getLogById,
  );

  router.post(
    "/",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createMetricLogSchema),
    createMetricLog,
  );

  router.put(
    "/:id",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateMetricLogSchema),
    updateLog,
  );

  router.delete(
    "/:id",
    userRateLimiter,
    validate(deleteMetricLogSchema),
    deleteLog,
  );

  if (env.ENABLE_DUMMY_ENDPOINTS) {
    router.post(
      "/:metricId/dummy",
      userRateLimiter,
      requireJsonObjectBody(),
      validate(generateDummyMetricLogsSchema),
      generateDummyMetricLogs,
    );
    router.all("/:metricId/dummy", methodNotAllowed(["POST"]));
  }

  router.all("/", methodNotAllowed(["GET", "POST"]));
  router.all("/:id", methodNotAllowed(["GET", "PUT", "DELETE"]));

  return router;
};
