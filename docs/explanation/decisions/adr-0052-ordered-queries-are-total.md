# ADR-0052 — Ordered queries are total, and log queries order by when the value was logged

- **Status:** Accepted
- **Date:** 2026-09-30
- **Related:** `.claude/rules/database.md` § Query ordering;
  `docs/internal/todos/2026-09-25-todo-integration-parse-error-flake.md` (the fixture fix for the
  same test, one layer down).
- **Origin:** `D-01` and `D-02` in the deterministic-query-ordering kit —
  [`deterministic-query-ordering`](../../internal/initiatives/deterministic-query-ordering/decisions.md)

---

## Context

On 2026-09-30 a Fork Smoke run for PR #124 (run `36695083548`, attempt 1) failed one integration
test: the metric-detail endpoint's two latest logs came back as `[20, 30]` instead of `[30, 20]`.
The query ordered by `createdAt DESC` with a `LIMIT`. Three rows inserted back to back can share a
millisecond, and Postgres guarantees no order among rows that tie on every sort key. The rerun
passed; the defect did not go away.

A sweep of every ordering site in `src/` found the same shape in four more places — the three
membership queries (one of which picks the organization a user lands in at login) and the dashboard
metrics query — and one more problem in two of them: logs were ordered and, for trends, filtered
and dated by `createdAt`, the time the row was inserted, rather than `loggedAt`, the time the value
is for. The two differ for every backfilled log. Every visualization query already used
`logged_at`.

The four `buildOrder` helpers behind the list endpoints already ended with `id`; the rule existed in
practice and was never written down, so the queries written outside those helpers missed it.

## Decision

1. **An `ORDER BY` that feeds `LIMIT`, pagination, or a "first" or "latest" pick is a total order:
   it ends with a unique column, `id`, in the same direction as the key before it.** Where a unique
   constraint already makes the leading key unique, `id` is added anyway, so dropping the
   constraint later cannot silently reintroduce ties.
2. **Queries over metric logs order, filter and report by `loggedAt`, then `id` — not by
   `createdAt`.** `createdAt` is audit data about the row; `loggedAt` is the domain time.

Applied in the same change to the metric-detail logs, trends, the three membership queries, and the
dashboard metrics query.

## Options considered

- **Fix the tests, not the queries** — a strictly increasing `createdAt` in fixtures, sleeps between
  inserts, Jest retries, or quarantine. Rejected: each makes CI green and leaves the API returning
  a different order, or a different set of rows at a `LIMIT` boundary, from one call to the next.
- **Add the tie-breaker but keep `createdAt` for logs.** Rejected: deterministic, but still wrong
  for any backfilled log — it ranks as newest and plots on the day it was typed in — and
  inconsistent with the visualization queries.
- **Rely on unique constraints instead of a written rule.** Rejected as the rule: correct today for
  `metric_logs (metric_id, logged_at)`, invisible to whoever edits the query next, and silently
  wrong if the constraint changes.
- **Time-ordered ids (UUIDv7) so the tie-breaker is also chronological.** Deferred: a schema
  decision with a migration, and not needed for determinism.

## Consequences

- **Observable API change, no type change.** For users with backfilled logs, metric detail returns
  its latest logs by `loggedAt`, and `GET /metrics/:id/trends` places and windows points by
  `loggedAt`. The OpenAPI `TrendDataPoint.date` description says so. Cached responses keep the old
  order until their TTL expires.
- **Ties are stable, not chronological.** Ids are UUIDv4, so two rows tied on the leading key come
  back in a fixed order that is not "which came first".
- **Tests prove ordering by forcing it.** A test of an ordered query inserts ties or backfills with
  explicit ids and timestamps, arranged so insertion order and index order both disagree with the
  expected order. A test that relies on insert timing passes by luck and fails at random later.
- **Performance is unchanged or better.** The log queries now match the existing
  `(metric_id, logged_at DESC)` index.

## Links

- Kit: `docs/internal/initiatives/deterministic-query-ordering/`
- Rule: `.claude/rules/database.md` § Query ordering
- Index: `src/migrations/20251217170030-add-metric-logs-indexes-phase2.cjs`
