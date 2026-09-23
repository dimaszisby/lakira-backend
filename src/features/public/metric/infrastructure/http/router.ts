import { Router } from "express";
import { z } from "zod";
import {
  createMetric,
  getUserMetricLibrariesViaCursor,
  getUserDetailMetricById,
  updateMetric,
  deleteMetric,
  generateDummyMetrics,
  handleMetricTrend,
} from "./controller.js";
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
import { AuthRequest } from "@/types/request.context.js";
import { env } from "@/config/envManager.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

import {
  METRIC_CURSOR_FEATURE,
  METRIC_CURSOR_VERSION,
} from "../../application/cache.constants.js";

const metricsCursorCacheKey = (req: AuthRequest) => {
  const limit = Number(asString(req.query.limit) ?? 20);
  const sort = asString(req.query.sort) ?? "-createdAt";
  const search = asString(req.query.q) ?? "";
  const fname = asString(req.query["filter[name]"]) ?? "";
  const fcat = asString(req.query["filter[categoryId]"]) ?? "";
  const after = asString(req.query.after) ?? "";
  const includeTotal = asString(req.query.includeTotal) ?? "false";

  return buildCursorCacheKey({
    feature: METRIC_CURSOR_FEATURE,
    version: METRIC_CURSOR_VERSION,
    userId: req.user?.id,
    organizationId: req.user?.organizationId,
    segments: [
      ["l", limit],
      ["s", sort],
      ["q", search],
      ["fn", fname],
      ["fc", fcat],
      ["after", after],
      ["it", includeTotal],
    ],
  });
};

const metricCacheKey = (req: AuthRequest) => {
  const includeRaw = asString(req.query.include) ?? "flat";
  const logsLimit = Number(asString(req.query.logsLimit) ?? 20);
  const allowed = ["settings", "category", "logs"] as const;

  const isAllowedInclude = (value: string): value is (typeof allowed)[number] =>
    allowed.includes(value as (typeof allowed)[number]);

  let includeNormalized = "flat";
  if (includeRaw === "full") {
    includeNormalized = "category,logs,settings";
  } else if (includeRaw !== "flat") {
    includeNormalized = includeRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is (typeof allowed)[number] => isAllowedInclude(s))
      .sort()
      .join(",");
    if (!includeNormalized) includeNormalized = "flat";
  }

  return `metric:${req.user?.organizationId}:${req.user?.id}:${req.params.id}:inc:${includeNormalized}:ll:${logsLimit}`;
};

export const createMetricRouter = () => {
  const router = Router();
  router.use(authMiddleware);

  router.post(
    "/",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createMetricSchema),
    createMetric,
  );

  router.get(
    "/",
    validate(getAllMetricsViaCursorSchema),
    cacheMiddleware(metricsCursorCacheKey, 60),
    getUserMetricLibrariesViaCursor,
  );

  router.get(
    "/:id",
    validate(getMetricSchema),
    cacheMiddleware(metricCacheKey, 60),
    getUserDetailMetricById,
  );

  router.put(
    "/:id",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateMetricSchema),
    updateMetric,
  );

  router.delete(
    "/:id",
    userRateLimiter,
    validate(deleteMetricSchema),
    deleteMetric,
  );

  const trendParams = { params: z.object({ metricId: z.string().uuid() }) };
  router.get("/:metricId/trends", validate(trendParams), handleMetricTrend);

  if (env.ENABLE_DUMMY_ENDPOINTS) {
    router.post(
      "/dummy",
      userRateLimiter,
      requireJsonObjectBody(),
      validate(generateDummyMetricsSchema),
      generateDummyMetrics,
    );
    router.all("/dummy", methodNotAllowed(["POST"]));
  }

  router.all("/", methodNotAllowed(["GET", "POST"]));
  router.all("/:id", methodNotAllowed(["GET", "PUT", "DELETE"]));
  router.all("/:metricId/trends", methodNotAllowed(["GET"]));

  return router;
};

export const metricRouter = createMetricRouter();
