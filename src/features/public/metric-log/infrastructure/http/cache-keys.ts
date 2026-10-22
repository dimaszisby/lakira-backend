import { AuthRequest } from "@/types/request.context.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";
import { pickValidated } from "@/shared/middleware/validated.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import {
  getAggregatedStatsSchema,
  getMetricLogByIdSchema,
  listMetricLogsViaCursorSchema,
} from "./schema.zod.js";
import {
  METRIC_LOG_CURSOR_FEATURE,
  METRIC_LOG_CURSOR_VERSION,
} from "../../application/cache.constants.js";

/**
 * Cache key for `GET /metric-logs`, built from the validated query — the same value the
 * handler queries with — as the metric and metric-settings lists are. The key it replaces
 * was hand-built from raw `req.query`, with `"_.js"` and `".js"` as empty sentinels left by
 * a codemod, and logged itself, search text included (kit query-values-mean-what-they-say,
 * D-04; audit S12, R13). One segment per field the repository applies. `fm` is the
 * segment `MetricLogCacheRedis` invalidates by.
 */
export const metricLogsCursorCacheKey = (req: AuthRequest) => {
  // Throws without a tenant; cacheMiddleware then skips the cache
  // (architecture-boundaries D-03).
  assertAuthenticated(req);
  const { query } = pickValidated(listMetricLogsViaCursorSchema)(req);

  return buildCursorCacheKey({
    feature: METRIC_LOG_CURSOR_FEATURE,
    version: METRIC_LOG_CURSOR_VERSION,
    userId: req.user.id,
    organizationId: req.user.organizationId,
    segments: [
      ["l", query.limit],
      ["s", query.sort],
      ["q", query.q ?? ""],
      ["fm", query.filter?.metricId ?? ""],
      ["fn", query.filter?.logValue],
      ["after", query.after ?? ""],
      ["it", query.includeTotal],
    ],
  });
};

/**
 * Cache key for `GET /metric-logs/:id?metricId=`. The handler answers 404 when the log
 * belongs to another metric, so the metric is part of the key: without it a 200 for the
 * log under its own metric was replayed for any other (D-05; audit T5).
 * `MetricLogCacheRedis` deletes `log:<org>:<user>:<id>:*`, every metric's entry at once.
 */
export const metricLogCacheKey = (req: AuthRequest) => {
  const { params, query } = pickValidated(getMetricLogByIdSchema)(req);
  return `log:${req.user?.organizationId}:${req.user?.id}:${params.id}:m:${query.metricId}`;
};

/**
 * Cache key for `GET /metric-logs/stats`, from the validated query. The key it replaces was
 * built from raw `req.query` and left the range out, so a ranged request was answered from the
 * all-time entry (kit metric-log-stats-in-sql D-03; audit X11, X20). Each bound is written in
 * epoch milliseconds: no `:` to encode, and two spellings of one instant share an entry.
 * `MetricLogCacheRedis` deletes `logStats:<org>:<user>:m:<metricId>:*` and `...:m:all:*`.
 */
export const metricLogStatsCacheKey = (req: AuthRequest) => {
  const { query } = pickValidated(getAggregatedStatsSchema)(req);
  const ms = (value?: string) => (value ? Date.parse(value) : "_");
  return `logStats:${req.user?.organizationId}:${req.user?.id}:m:${query.metricId ?? "all"}:s:${ms(query.startDate)}:e:${ms(query.endDate)}`;
};
