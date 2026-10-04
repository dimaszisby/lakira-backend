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
