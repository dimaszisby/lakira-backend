# Deterministic Query Ordering — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Every ordered query that feeds a limit or a pick ends with a unique column

- **Status:** Accepted
- **Date:** 2026-09-30

Promoted to the architecture decision registry as **[ADR-0052](../../../explanation/decisions/adr-0052-ordered-queries-are-total.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — Queries over logs use `loggedAt`, not `createdAt`

- **Status:** Accepted
- **Date:** 2026-09-30

Promoted to the architecture decision registry as **[ADR-0052](../../../explanation/decisions/adr-0052-ordered-queries-are-total.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — Remove `findLatestByUserId` instead of patching it

- **Status:** Accepted
- **Date:** 2026-09-30

**Context.** `EmailVerificationTokenRepository.findLatestByUserId` has no production caller — only
its implementation, an integration test and two unit-test mocks. That integration test saves two
tokens back to back and expects the second, the same latent race as the CI flake.
**Decision.** Delete the method from the port and the implementation, and delete its tests and
mocks.
**Options considered.** Add the `id` tie-breaker and give the test explicit `createdAt` values:
rejected, it keeps unused code whose name promises "latest", which a random-UUID tie-breaker cannot
deliver.
**Consequences.** The port loses a method. A future caller re-adds it with an explicit ordering.

## D-04 — The dashboard's latest value is ranked by `logged_at`, then `id`

- **Status:** Accepted
- **Date:** 2026-10-04

Micro entry for audit finding S7 (P2). Commits carry `refs: dashboard-latest-value-tiebreaker`.

**Context.** `buildDashboardLifecycleSQL` picked each metric's latest log with
`row_number() OVER (PARTITION BY l.metric_id ORDER BY l.ts_tz DESC)`, which #125 missed. The
finding names two logs at the same instant as the cause, and that cannot happen: `metric_logs` is
unique on `(metric_id, logged_at)`. The tie comes from the sort key. `ts_tz` is
`timezone(:tz, logged_at)`, a local wall-clock time, and when a zone leaves daylight saving time
two instants an hour apart get the same one (05:30Z and 06:30Z on 2025-11-02 are both 01:30 in
`America/New_York`). Postgres may rank either of them first.
**Decision.** The window orders by `l.logged_at DESC, l.id DESC`. The `logs` CTE selects
`ml.logged_at` and `ml.id` for it.
**Options considered.** Appending `l.id DESC` to `l.ts_tz DESC`, as the todo suggested: rejected,
it is stable and can be stably wrong, because ids are UUIDv4 and the earlier log wins the tie half
the time. `l.ts_tz DESC, l.logged_at DESC, l.id DESC`: rejected, `ts_tz` is a function of
`logged_at` that never reverses its order, so it adds nothing and keeps the sort off the
`(metric_id, logged_at DESC)` index.
**Consequences.** The latest value is the log with the latest instant, in every time zone. The
trailing `id` cannot decide anything while the unique constraint stands, so no test can force it;
it is there because ADR-0052 decision 1 asks for it even where a constraint makes the leading key
unique. `first_log_at` and `last_log_at` are still the minimum and maximum of `ts_tz` and are not
changed. No output column changes.

## D-05 — Visualization stats are computed over the whole series, by one function

- **Status:** Accepted
- **Date:** 2026-10-08

Micro entry for the frontend's request "Dashboard stats describe the first bucket only" (P1,
raised 2026-10-07 in Notion, "FE and BE messages", Part 1). Commits carry
`refs: dashboard-stats-whole-series`. It is logged here because D-04 is the previous fix to the
same dashboard read path; it is not an ordering decision.

**Context.** `buildDashboardItem` in `VisualizationReadRepoSequelize.ts` read `average`, `min`,
`max` and `count` from the first row of the series, so a metric whose first bucket was empty
answered `count: 0` and three nulls whatever the other buckets held. The request asks for the
dashboard to match `fetchVisualization`. That path summed `count` and took `min` and `max` across
rows, but assigned `average` on every row, so it returned the last non-empty bucket's average.
Matching it as written would have copied a second defect.
**Decision.** One pure function, `summarizeBuckets` in the analytics `domain/`, computes the stats
for both endpoints from the bucket rows. `average` is the mean of the logs: the sum of each
bucket's average times its count, over the total count. A bucket with no logs contributes nothing.
**Options considered.** Copying the single-metric loop into the dashboard: rejected, it carries
the last-bucket average. Adding `sum(log_value)` to both SQL builders and dividing the sums:
rejected, the result is the same and it changes two queries and two row types for nothing. A
second aggregate query for each metric: rejected, it is one more round trip for every dashboard
card. Averaging the bucket averages: rejected, it weights a day with one log the same as a day
with ten, which the request names as wrong.
**Consequences.** `GET /analytics/metrics/:id` returns a different `average` for any range with
more than one non-empty bucket; the earlier figure was wrong. No field is added or removed and the
OpenAPI spec does not change. Cached responses keep the old figures until `VIZ_DEFAULT_TTL_SEC`
(120 seconds by default) runs out, so no cache key is changed. With the fallback range in use the
stats describe the fallback series, as before.

## D-06 — The dashboard's validator is a hash of its body, and the browser revalidates every time

- **Status:** Proposed
- **Date:** 2026-10-09

Micro entry for the frontend's request "Dashboard responses stay cached in the browser after a log
changes" (P1, raised 2026-10-08 in Notion, "FE and BE messages", Part 1). Commits carry
`refs: dashboard-etag-ignores-logs`. It is logged here because D-04 and D-05 are the earlier fixes
to the same dashboard read path; it is not an ordering decision.

**Context.** `GET /analytics/dashboard` sent `sync.etagSeed` as its `ETag`. The seed hashes the
cache key and the `updated_at` of the metrics, their settings and their categories. No log is in
it, so creating, editing or deleting a log changed the body and left the ETag alone, and a request
with `If-None-Match` was answered 304. Both analytics routes also sent
`private, max-age=60, stale-while-revalidate=30`, so for a minute the browser did not ask at all.
A user who logged a value kept seeing the old card. The response is computed in full before the
conditional is checked, so the seed saved no work.
**Decision.** The dashboard handler hashes the response body, as the single-metric handler does.
Both routes send `private, no-cache`. `VIZ_CACHE_MAX_AGE_SEC` and `VIZ_CACHE_STALE_SEC` are
removed; the owner chose this on 2026-10-09.
**Options considered.** Adding the logs' latest `updated_at` and count to the fingerprint:
rejected, a delete or an edit needs yet another input, and the next field added to the body is
missed the same way. Keeping `max-age` with a correct ETag: rejected, the card is stale for up to
90 seconds after a write and the frontend cannot refetch past the browser's cache. Keeping the two
variables with a default of 0: rejected, the stale card stays one setting away. Removing
`sync.etagSeed` from the body: rejected, a contract change this fix does not need.
**Consequences.** Every dashboard view costs one conditional request. The handler builds the
response before it compares validators, from the Redis cache when the entry is there and from the
database when it is not, and answers 304 when nothing changed. `sync.etagSeed` stays in the body and is no
longer the `ETag`. A deployment that still sets either removed variable starts as before and the
value is ignored. ADR-0033 lists seven analytics variables; five remain.
