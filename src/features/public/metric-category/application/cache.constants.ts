import { cursorCacheNamespace } from "@/shared/cache/keys.js";

export const METRIC_CATEGORY_CURSOR_FEATURE = "metric-categories";
// 3: entries hold a snapshot, not entities; a v2 entry is never read
// (category-list-cache-dates D-01).
export const METRIC_CATEGORY_CURSOR_VERSION = 3;

export const METRIC_CATEGORY_CURSOR_NAMESPACE_ALL = cursorCacheNamespace(
  METRIC_CATEGORY_CURSOR_FEATURE,
  "*",
);
