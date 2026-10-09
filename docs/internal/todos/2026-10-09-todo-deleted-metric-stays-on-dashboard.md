# Todo — a deleted metric stays on the dashboard

- **Status:** Open (P2, proposed). Reproduced on 2026-10-09
- **Created:** 2026-10-09
- **Owner:** unassigned
- **Found by:** the review of `fix/dashboard-etag-ignores-logs`
  ([`deterministic-query-ordering` D-06](../initiatives/deterministic-query-ordering/decisions.md)).
  Not caused by that change

## The defect

`DELETE /metrics/:id` is a soft delete: the `Metric` model is paranoid, so the row stays with
`deleted_at` set, and its `metric_settings` row stays too. `fetchDashboardMetrics` in
`src/features/public/analytics/infrastructure/persistence/VisualizationReadRepoSequelize.ts` is raw
SQL that joins `metric_settings` to `metrics` with no `m.deleted_at IS NULL`, so the deleted
metric is still selected.

## Reproduction

A throwaway integration test on 2026-10-09, branch `fix/dashboard-etag-ignores-logs`: one metric
shown on the dashboard with one log.

| Step                       | Result              |
| -------------------------- | ------------------- |
| `GET /analytics/dashboard` | 200, one item       |
| `DELETE /metrics/:id`      | 200                 |
| `GET /analytics/dashboard` | 200, still one item |

The test was not kept.

## The fix

Add `AND m.deleted_at IS NULL` to `fetchDashboardMetrics`, with an integration case in
`__tests__/integration/api/analytics-caching.test.ts` or beside the read repository's tests.

## Also noted, read in the code and not reproduced

- `DeleteMetric` clears the metric caches only, never `vizdash:*` or `viz:*`. Once the query
  filters deleted metrics the metric id list in the cache key changes, so the dashboard entry is
  missed without an invalidation. The single-metric entry `viz:*` is reached only through an
  ownership check, which should already reject a deleted metric; confirm it with the fix.
- Whether the lifecycle and series queries, and the single-metric path, can return a deleted
  metric's data by another route.
- A dashboard read that queries the database just before a log write and stores its result just
  after the write's invalidation puts the old body back for `VIZ_DEFAULT_TTL_SEC` (120 seconds).
  The window is small. The validator then matches the stale body, so the browser cannot tell.
