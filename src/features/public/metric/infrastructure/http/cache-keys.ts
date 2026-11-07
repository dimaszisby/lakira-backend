import { AuthRequest } from "@/types/request.context.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";
import { pickValidated } from "@/shared/middleware/validated.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import { getAllMetricsViaCursorSchema, getMetricSchema } from "./schema.zod.js";
import { metricDetailIncludes } from "./detail-includes.js";
import {
  METRIC_CURSOR_FEATURE,
  METRIC_CURSOR_VERSION,
  metricEntryKey,
} from "../../application/cache.constants.js";

/**
 * Cache key for `GET /metrics`, built from the validated query — the same value
 * the handler queries with — so the key cannot disagree with what it caches.
 *
 * It used to read `req.query["filter[name]"]`, but Express nests that as
 * `req.query.filter.name`, so every name and category filter shared one entry
 * (audit R2; kit `list-cache-key-filters`, D-01). The schema already folds both
 * spellings into `filter`.
 */
export const metricsCursorCacheKey = (req: AuthRequest) => {
  // Throws without a tenant; cacheMiddleware then skips the cache
  // (architecture-boundaries D-03).
  assertAuthenticated(req);
  const { query } = pickValidated(getAllMetricsViaCursorSchema)(req);

  return buildCursorCacheKey({
    feature: METRIC_CURSOR_FEATURE,
    version: METRIC_CURSOR_VERSION,
    userId: req.user.id,
    organizationId: req.user.organizationId,
    segments: [
      ["l", query.limit],
      ["s", query.sort],
      ["q", query.q ?? ""],
      ["fn", query.filter?.name ?? ""],
      ["fc", query.filter?.categoryId ?? ""],
      ["after", query.after ?? ""],
      ["it", query.includeTotal],
    ],
  });
};

/**
 * Cache key for `GET /metrics/:id`, from the validated id, includes and log limit. It
 * read raw `req.params` and `req.query` (api-tooling-residuals D-03, audit X11).
 */
export const metricDetailCacheKey = (req: AuthRequest) => {
  assertAuthenticated(req);
  const { params, query } = pickValidated(getMetricSchema)(req);
  const includes = metricDetailIncludes(query.include);

  return metricEntryKey(
    req.user.organizationId,
    req.user.id,
    params.id,
    includes.length ? includes.join(",") : "flat",
    query.logsLimit ?? 20,
  );
};
