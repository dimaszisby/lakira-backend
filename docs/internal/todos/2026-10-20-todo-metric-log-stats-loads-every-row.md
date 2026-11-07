# Todo — `GET /metric-logs/stats` loads every log

- **Status:** Closed by #202 (`5a3addb`), branch `fix/metric-log-stats-in-sql`
  ([`metric-log-stats-in-sql`](../initiatives/metric-log-stats-in-sql/README.md), ADR-0079).
  Reproduced by a test first; a dated run is owed to confirm it
- **Created:** 2026-10-20
- **Owner:** unassigned
- **Origin:** dated SaaS-readiness run of 2026-10-20, finding X20
  ([`audit-2026-10-20.md`](../audits/saas-readiness/audit-2026-10-20.md) § 6)

---

## What

`MetricLogStatsRepoSequelize` loads every log in scope and spreads the values into `Math.min` and
`Math.max` (`MetricLogStatsRepoSequelize.ts:36-46`); `startDate` and `endDate` are validated and then
dropped (`controller.ts:136-141`), are not in the spec, and are not in the cache key. Also N10 and F4
of the 2026-06-05 run.

Reproduced on the dated run of 2026-10-20: with 200,000 logs the endpoint answers 500 from
`RangeError: Maximum call stack size exceeded`, and the body is the same with and without
`startDate`.

## Suggested fix

Compute the stats in SQL (`MIN`, `MAX`, `AVG`, `COUNT`), and either honour `startDate`/`endDate`
(with the spec and the cache key) or remove them.
