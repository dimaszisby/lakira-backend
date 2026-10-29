# Todo — the metrics list answers `logCount: 0` for a metric that has logs

- **Status:** Open. Issue #251 (was register row B-100)
- **Created:** 2026-10-28
- **Owner:** unassigned
- **Origin:** the Notion record "The metrics list reports logCount 0 for a metric that has logs"
  (FE and BE messages, Part 1, P3, 2026-10-27), from lakira-frontend #170 (its row F-58)

---

## What

On a local stack, after creating a metric and posting two logs to it (201 each), `GET /metrics`
listed the metric with `logCount: 0`. The frontend shows the count it is given and has no
workaround; it left the categories list's axe spec out of its Cypress suite until this is fixed.

The count is `LOG_COUNT_SQL` in
`src/features/public/metric/infrastructure/persistence/repositories/MetricReadRepoSequelize.ts:215`,
a correlated `COUNT(*)` over `metric_logs`, used as the `logCount` attribute and as its sort, and
mapped to the response at `src/features/public/metric/infrastructure/http/dto.ts:301`. Checked on
`dev` at `6049cc6`.

## Inference, not confirmed

The metrics list is cached (`MetricCacheRedis`, namespace `METRIC_CURSOR_NAMESPACE_ALL`), and only
a change to a metric invalidates it (`invalidateMetrics`). Creating a log
(`CreateMetricLog.ts:65`) invalidates the log, stats and visualization caches
(`MetricLogCacheRedis.ts:33-60`) but not the metrics list. With Redis on, a list read before the
logs were posted would be served again with its old count. The SQL itself has not been shown wrong.

## Suggested fix

1. An integration test with the cache on: list metrics, post two logs, list again, and expect
   `logCount: 2`. See it fail.
2. If the cache is the cause, a new or deleted log invalidates its metric's list entries too, the
   same way `invalidateMetrics` does.
3. Then the frontend adds back its axe spec and closes its #170 (the Notion record's follow-up).
