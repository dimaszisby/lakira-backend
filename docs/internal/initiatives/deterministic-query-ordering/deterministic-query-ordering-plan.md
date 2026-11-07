# Deterministic Query Ordering — Plan

- **Status:** Approved
- **Appetite:** 1 day — past that, cut scope rather than extend
- **Date:** 2026-09-30

## Context and goals

PR #124's Fork Smoke job failed once (run `36695083548`, attempt 1; the rerun passed).
`MetricReadRepoSequelize.integration.test.ts` › "limits logs when fetching metric detail" got
`[20, 30]` instead of `[30, 20]`. The cause is in production code: the metric-detail logs query
sorts by `createdAt DESC` with a `LIMIT` (`MetricReadRepoSequelize.ts:183`). Rows inserted back to
back can share a millisecond, and Postgres returns tied rows in any order. It is the sibling of the
2026-09-27 fixture fix (`docs/internal/todos/2026-09-25-todo-integration-parse-error-flake.md`),
which made `loggedAt` unique but left `createdAt` alone.

A sweep of every ordering site in `src/`:

| #   | Site                                                                        | Current                                             | Problem                                                                                                  |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `MetricReadRepoSequelize.ts:183` — metric detail logs                       | `createdAt DESC` + `LIMIT`                          | Insert time, not log time: a backfilled log ranks newest. Ties possible. The CI flake.                   |
| 2   | `TrendRepoSequelize.ts` — `GET /metrics/:id/trends`                         | window, sort and `date` all on `createdAt`          | Backfilled logs plot on their insert date and fall out of their window. Other analytics use `logged_at`. |
| 3   | `MembershipRepositorySequelize.ts` `findDefaultByUser` — login/refresh      | `joinedAt ASC`                                      | No tie-breaker: a tie silently changes the default organization.                                         |
| 4   | `MembershipRepositorySequelize.ts` `findAllByUser`, `findAllByOrganization` | `joinedAt ASC`                                      | No tie-breaker: API list order is unstable.                                                              |
| 5   | `VisualizationReadRepoSequelize.ts` — dashboard metrics                     | `priority NULLS LAST, ms.created_at DESC` + `LIMIT` | No tie-breaker: a tie at the cut-off changes which metrics are returned.                                 |
| 6   | `EmailVerificationTokenRepositorySequelize.ts` `findLatestByUserId`         | `createdAt DESC`                                    | No production caller. Its test has the same latent race, and a UUIDv4 tie-breaker cannot fix it.         |

Already correct: the four `buildOrder` helpers (metric, metric-log, metric-category,
metric-settings) all end with `["id", dir]`; `visualization.dashboard.sql.ts` ranks by `logged_at`,
unique per metric; the other raw-SQL `ORDER BY`s are on unique keys.

`metric_logs` is unique on `(metric_id, logged_at)` (`20250109160356-create-metric_logs.cjs`) and
indexed on `(metric_id, logged_at DESC)` (`20251217170030-add-metric-logs-indexes-phase2.cjs`), so
within one metric `loggedAt` is already a total, index-backed order. `id` is added anyway, as the
uniform rule.

## Acceptance criteria

- **AC-1** — Metric detail returns the `logsLimit` logs with the latest `loggedAt`, newest first; a
  log inserted last but logged earliest is not returned first. _Why:_ sites 1; the CI flake.
- **AC-2** — Trends filter, sort and date by `loggedAt`: a log backfilled into the window appears at
  its `loggedAt` date, in order; a log inserted now with a `loggedAt` before the window is excluded.
  _Why:_ site 2.
- **AC-3** — Memberships tied on `joinedAt` come back in `id ASC` order from `findDefaultByUser`,
  `findAllByUser` and `findAllByOrganization`, every time. _Why:_ sites 3 and 4.
- **AC-4** — Dashboard metrics tied on priority and settings `created_at` have their order, and the
  set that fits in `LIMIT`, fixed by settings id. _Why:_ site 5.
- **AC-5** — `findLatestByUserId` no longer exists in the port, the implementation or the tests,
  and the suite passes. _Why:_ site 6.
- **AC-6** — `.claude/rules/database.md` states the ordering rule and ADR-0052 records it. _Why:_
  the rule has to outlive this sweep.

## Open questions

None.

## Out of scope

- Time-ordered ids (UUIDv7).
- A lint rule that detects a missing tie-breaker.
- The other flakes in `2026-09-25-todo-integration-parse-error-flake.md` (parse error, `TRUNCATE`
  deadlock).
- The `metric-trends-uses-analytics-composition-root` todo.
- Phase 2 of `error-envelope-residuals`.

## Decisions expected

- The tie-breaker rule (D-01), the time column for logs (D-02), and what to do with the unused token
  query (D-03). D-01 and D-02 are promoted together to ADR-0052 at the end.

## Phases

### Phase 1 — Queries

- `MetricReadRepoSequelize.ts` logs: `[["loggedAt", "DESC"], ["id", "DESC"]]`.
- `TrendRepoSequelize.ts`: `loggedAt >= since`, `[["loggedAt", "ASC"], ["id", "ASC"]]`, and
  `date: log.loggedAt`.
- `MembershipRepositorySequelize.ts`: `[["joinedAt", "ASC"], ["id", "ASC"]]` on all three.
- `VisualizationReadRepoSequelize.ts`: `ORDER BY priority NULLS LAST, ms.created_at DESC, ms.id DESC`.
- Remove `findLatestByUserId` from the port, the implementation, two unit mocks, and its
  integration block.

### Phase 2 — Tests that force the case

Each test forces its tie or backfill with explicit ids and timestamps, so it fails every time on the
old code. For ties the larger id is inserted first: without a tie-breaker Postgres tends to return
insertion order, which then differs from the expected id order.

- Metric detail: logs inserted out of `loggedAt` order.
- Trends (new file): backfill inside the window; a just-inserted log from before the window.
- Memberships (new file): two memberships with the same `joinedAt`.
- Dashboard: two metrics tied on priority and `created_at`, `limit` 1.

## Risks and trade-offs

- Behavior change, frontend-visible, no type change: metric-detail log order and trend dates can
  differ for users with backfilled logs. The PR carries a note for lakira-frontend.
- Cached analytics and trend responses keep the old order until their TTL expires.
- On a tie, `id` order is stable but not chronological.

## Rollback

Code: revert-safe — no migration, no data written. The index the new order uses already exists.

## References

- `docs/internal/todos/2026-09-25-todo-integration-parse-error-flake.md`
- `docs/explanation/decisions/README.md` — ADR registry
