import { AuthRequest } from "@/types/request.context.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";
import { pickValidated } from "@/shared/middleware/validated.js";
import { listMetricSettingsViaCursorSchema } from "./schema.zod.js";
import {
  METRIC_SETTINGS_CURSOR_FEATURE,
  METRIC_SETTINGS_CURSOR_VERSION,
} from "../../application/cache.constants.js";

/**
 * Cache key for `GET /metric-settings`, built from the validated query — the
 * same value the handler queries with. The hand-rolled key it replaces read raw
 * `req.query` and left out `filter.isActive` and `q`, which the repository
 * applies, so those filters shared one entry (kit list-cache-key-filters, D-04).
 */
export const metricSettingsCursorCacheKey = (req: AuthRequest) => {
  const { query } = pickValidated(listMetricSettingsViaCursorSchema)(req);

  return buildCursorCacheKey({
    feature: METRIC_SETTINGS_CURSOR_FEATURE,
    version: METRIC_SETTINGS_CURSOR_VERSION,
    userId: req.user?.id,
    organizationId: req.user?.organizationId,
    segments: [
      ["l", query.limit],
      ["s", query.sort],
      ["q", query.q ?? ""],
      ["fm", query.filter?.metricId ?? ""],
      ["fa", query.filter?.isActive],
      ["after", query.after ?? ""],
      ["it", query.includeTotal],
    ],
  });
};
