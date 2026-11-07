# Dashboard Service Layer Notes

## Scope

This note captures the backend behaviors added during the Service & Application phase of the analytics overhaul so that future contributors understand how `/analytics/dashboard` assembles its payload.

## Lifecycle Metadata Hydration

- `GetDashboardVisualization.ts` now joins the lifecycle CTE (via `buildDashboardLifecycleSQL`) to populate `firstLogAt`, `lastLogAt`, `totalLogs`, `latestValue`, and `latestBucketStart` for every metric returned.
- Each dashboard item also echoes `requestedRange` and a potentially different `actualRange`, enabling the UI to message whether the data matches the user-selected filters.

## Fallback Range Resolution

1. When a metric has no samples inside the requested window (`cnt` = 0 for all generated buckets) but `lastLogAt` exists, the service invokes `computeFallbackRange` with:
   - the requested bucket/range,
   - `lastLogAt` as the anchor,
   - the global 400-bucket guard.
2. The helper may coarsen the bucket (e.g., `1d → 1w`) to keep buckets within guardrails, then returns a `{startISO, endISO, bucket}` tuple.
3. The service re-runs the series SQL for that metric only, using the fallback window, and marks `fallbackRangeUsed=true` with `fallbackStrategy="last_activity_window"` so the frontend can annotate the card.

## Metadata & Observability

- Response-level metadata now includes `meta.totalMetrics`, `meta.fallbackMetrics`, and `sync.etagSeed` (now hashed from the dash cache key + metadata version fingerprint) to support pagination banners and cache coordination.
- `vizDashKey` incorporates a version cursor built from `metric.updated_at`, `metric_settings.updated_at`, and `metric_categories.updated_at`, so Redis entries automatically expire when metadata changes.
- Whenever fallback data is emitted, the service logs `analytics.dashboard.fallback_range_used` with `{metricId, userId, requestedRange, actualRange, fallbackStrategy}` via Winston so adoption can be monitored.
- `handleGetDashboardVisualization` now emits `Cache-Control: private, max-age=<env VIZ_CACHE_MAX_AGE_SEC>, stale-while-revalidate=<env VIZ_CACHE_STALE_SEC>` so FE caches align with backend guarantees, and HTTP `ETag` header reuses `sync.etagSeed`.

## Next Considerations

- Evaluate batching fallback queries by bucket type if fallback adoption grows beyond the expected low-single-digit metrics per request.
- Extend observability with counters/metrics (e.g., Prometheus) once the logging pattern proves stable.
