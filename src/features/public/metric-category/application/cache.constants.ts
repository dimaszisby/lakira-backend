import { cursorCacheNamespace } from "@/shared/cache/keys.js";

export const METRIC_CATEGORY_CURSOR_FEATURE = "metric-categories";
// 3: entries hold a snapshot, not entities; a v2 entry is never read
// (category-list-cache-dates D-01).
// 4: string segments are encoded, so free text cannot stand for another segment
// (query-values-mean-what-they-say D-03); a v3 entry is never read.
export const METRIC_CATEGORY_CURSOR_VERSION = 4;

export const METRIC_CATEGORY_CURSOR_NAMESPACE_ALL = cursorCacheNamespace(
  METRIC_CATEGORY_CURSOR_FEATURE,
  "*",
);

// `GET /metric-categories/:id`. Its route builds the key and every category write
// deletes it, both from here: the writes once spelled it without the organization, so
// nothing they deleted matched (api-tooling-residuals D-03, register row B-90).
export const categoryEntryKey = (
  organizationId: string,
  userId: string,
  categoryId: string,
): string => `category:${organizationId}:${userId}:${categoryId}`;
