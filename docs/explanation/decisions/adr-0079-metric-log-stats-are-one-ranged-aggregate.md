# ADR-0079 — Metric-log stats are one aggregate, over a half-open range of `loggedAt`

- **Status:** Accepted
- **Date:** 2026-10-21
- **Related:** [ADR-0052](./adr-0052-ordered-queries-are-total.md) (metric logs are filtered and
  dated by `loggedAt`); [ADR-0075](./adr-0075-cache-keys-encode-and-include-total-is-strict.md)
  (cache keys); [ADR-0035](./adr-0035-tenant-scoped-cache-keys.md) (tenant-scoped keys)
- **Origin:** `D-01` to `D-03` in the metric-log-stats-in-sql kit —
  [`metric-log-stats-in-sql`](../../internal/initiatives/metric-log-stats-in-sql/decisions.md);
  register row B-79 (finding X20 of the dated run of 2026-10-20; N10 and F4 of the 2026-06-05 run),
  with the stats key of X11/X21 of B-82 (register D-09)

---

## Context

`GET /metric-logs/stats` answers the average, minimum and maximum of the caller's logs, for one
metric or all of them. The dated run of 2026-10-20 reproduced two defects:

- `MetricLogStatsRepoSequelize.computeStats` loaded every log in scope and spread the values into
  `Math.min` and `Math.max`. With 200,000 logs the endpoint answered 500 from
  `RangeError: Maximum call stack size exceeded`. The 2026-06-05 run had found the load itself (N10)
  and named it a memory and database-load risk on an unbounded range (F4).
- `startDate` and `endDate` were validated and then dropped. They were not in the spec or the
  cache key, so a ranged request got the all-time answer, and a cached all-time answer was replayed
  for any range.

The stats key was also built from raw `req.query` (X11/X21), against `api-design.md`.

## Decision

1. **The stats are one aggregate row.** `AVG`, `MIN`, `MAX` and `COUNT` of `log_value`, computed by
   Postgres through Sequelize's `fn` and `col` on the same `where` and `include` as before, so the
   tenant scoping is written once: a named metric by metric and organization (its ownership is
   checked first by `GetMetricLogStats`), otherwise the organization and an inner join to the
   caller's own metrics. No log in scope answers `{ average: 0, min: 0, max: 0 }`, as before.
   The response shape does not change.
2. **The range is honoured, half-open, by `loggedAt`.** `startDate <= loggedAt < endDate`, either
   bound optional, as the analytics queries bound theirs. Both are ISO 8601 datetimes with an
   offset; when both are given, `endDate` must be after `startDate`, else 400. There is no cap on
   the span: one indexed aggregate has neither the memory nor the load F4 was about.
3. **The cache key is built from the validated query and names the range** in epoch milliseconds:
   `logStats:<org>:<user>:m:<metricId|all>:s:<startMs|_>:e:<endMs|_>`. A write to a metric's logs
   deletes the patterns `logStats:<org>:<user>:m:<metricId>:*` and `logStats:<org>:<user>:m:all:*`.

## Options considered

- _Raw SQL, as the analytics queries are written._ The tenant scoping would be written a second
  time by hand, and it is the part that must not drift.
- _Keep the JavaScript reduce without the spread._ It still loads every row.
- _Remove `startDate` and `endDate`._ The smallest change; the owner chose to honour them.
- _An inclusive `endDate`._ A caller asking for one day would pass `23:59:59.999`, and it would
  differ from analytics.
- _Date-only bounds in a zone._ The endpoint has no `tz`, and analytics owns zone-aware buckets.
- _A maximum span, as F4 suggested._ It would refuse a legitimate all-time question and protect
  nothing once the rows are not loaded.
- _ISO strings in the cache key._ They hold `:`, which ADR-0075 encodes, and two spellings of one
  instant would be two entries.

## Consequences

- One row comes back at any volume: 200,000 logs answer in tens of milliseconds on a laptop, by a
  scan of the metric's rows or, with a range, the BRIN index on `logged_at`.
- A caller that sent a date-only or zone-less bound now gets 400 instead of a silently ignored
  parameter. The frontend does not call the endpoint (frontend `origin/dev` at `7fc20e5`); its
  generated types gain two optional parameters when it next regenerates.
- Cache entries in the old key form are never read again and expire within their 300 s TTL.
- The other two raw-query cache keys of X11/X21 remain (register B-82).

## Enforcement

`__tests__/integration/api/metric-log-stats.test.ts`: 200,000 logs; the half-open bounds, each
alone, another offset, an empty range; the 400s; the scoping, with a colleague's metric and another
organization's; and, against a live Redis when `ENABLE_REDIS_INTEGRATION` is set, that one write
clears every cached range of its metric and of "all" and nothing else. On the code before this
change, the first four failed (the first with the `RangeError` 500). Unit tests:
`MetricLogStatsRepoSequelize.test.ts`, `cache-keys.test.ts`, `router.test.ts`,
`MetricLogCacheRedis.test.ts`.

## Links

- Kit: [`metric-log-stats-in-sql`](../../internal/initiatives/metric-log-stats-in-sql/README.md)
- Audit: `docs/internal/audits/saas-readiness/audit-2026-10-20.md` § 6 (X20, X11, X21)
- Todo: `docs/internal/todos/2026-10-20-todo-metric-log-stats-loads-every-row.md`
