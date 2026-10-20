export const METRIC_CURSOR_FEATURE = "metrics";
// 3: keys now carry the filters (kit list-cache-key-filters, D-03). Entries
// written under the v2 key could hold one filter's page under a shared key.
// 4: string segments are encoded, so free text cannot stand for another segment
// (query-values-mean-what-they-say D-03); a v3 entry is never read.
export const METRIC_CURSOR_VERSION = 4;
