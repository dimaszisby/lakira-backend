export const METRIC_SETTINGS_CURSOR_FEATURE = "metric-settings";
// 3: keys now carry filter.isActive and q (kit list-cache-key-filters, D-04).
// Entries written under the v2 key could hold one filter's page under a key
// every value of that filter shared.
// 4: string segments are encoded, so free text cannot stand for another segment
// (query-values-mean-what-they-say D-03); a v3 entry is never read.
export const METRIC_SETTINGS_CURSOR_VERSION = 4;
