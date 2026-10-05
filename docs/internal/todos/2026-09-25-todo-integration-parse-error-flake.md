# Todo — intermittent `Parse Error: Expected HTTP/` in the integration suite

- **Status:** Open — the parse error is still unexplained. The `TRUNCATE` failure was explained
  on 2026-09-29 (a deadlock with a fire-and-forget write) and fixed on 2026-10-02 (see the last
  section). A third failure was explained and fixed on 2026-09-27
- **Created:** 2026-09-25
- **Owner:** unassigned
- **Origin:** the `node-24-runtime` kit's gate runs

---

## What

One full `npm test` run on Node 24.21.0 failed a single integration test:

```
FAIL integration __tests__/integration/api/metric-settings.test.ts
  ● Metric Settings API › validates payload combinations
    Parse Error: Expected HTTP/, RTSP/ or ICE/
```

The error comes from Node's HTTP client (`llhttp`), which received bytes that were not an HTTP
status line. The test uses `request(app)` from `__tests__/integration/helpers/test-utils.ts`, so
each request gets its own ephemeral server. That rules out an obvious shared-port collision.

## What was tried

| Run                                               | Result                           |
| ------------------------------------------------- | -------------------------------- |
| full `npm test`, Node 24, first run after install | 1 failed (this one), 195 passed  |
| the suite alone, Node 24, three times             | 12/12 each time                  |
| full integration, Node 24, five more times        | 196 passed, 5 skipped, each time |
| full integration, Node 20.20.2, three times       | 196 passed, 5 skipped, each time |

One failure in six full Node 24 runs, against zero in three on Node 20, does not tell a Node 24
regression apart from a pre-existing flake. The failing run was the first after `node_modules` was
reinstalled.

## If it recurs

Record the Node version, whether it was the first run after an install, and whether the same test
failed. Two occurrences on 24 and none on 20 would justify bisecting; a hit on 20 settles it as
pre-existing. Compare [`2026-09-24-todo-queue-test-intermittent-401.md`](2026-09-24-todo-queue-test-intermittent-401.md),
the other intermittent integration failure seen once.

## A second, different intermittent failure (2026-09-25, later)

On `feat/list-user-organizations`, one full `npm test` run on Node 24.21.0 failed
`metric-category.test.ts` › rejects invalid tokens. It failed not in an assertion but in the
shared setup's `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` (`jest.setup.ts:88`), with a Sequelize
database error whose message printed empty. It ran directly after `analytics-caching.test.ts`. Three
further full integration runs passed (202 passed, 5 skipped), one of them with `metric-category`
running right after `organization-membership`.

Two different one-off failures in the same week, both in the integration project and neither
reproducible, point at shared test infrastructure (connection or lock state between suites) more
than at either test. If either recurs, capture the full Postgres error first: the empty message is
the missing evidence.

## A third failure, explained and fixed (2026-09-27)

CI run `36333530834` (PR #116, `push` event) failed `MetricReadRepoSequelize.integration.test.ts`
› limits logs when fetching metric detail, in the `createMetricLogRow` fixture. Jest printed a
Sequelize error with an **empty message**, the same signature as the `TRUNCATE` failure above. The
`pull_request` run of the same commit passed.

**Where the evidence was.** The job's "Stop containers" step prints the Postgres service log. It
held the real error:

```
duplicate key value violates unique constraint "uq_metric_logs_metric_id_logged_at"
Key (metric_id, logged_at)=(..., 2026-09-27 16:33:51.545+00) already exists.
```

**Cause.** `createMetricLogRow` defaulted `loggedAt` to `new Date()`, which has millisecond
precision, and `metric_logs` is unique on `(metric_id, logged_at)`. The test creates three logs for
one metric back to back; on a fast runner two landed in the same millisecond. Reproduced locally
3/3 by creating 50 logs concurrently through the fixture, and confirmed in the local Postgres log.

**Fix.** On `fix/metric-log-fixture-timestamps`, the fixture's default is strictly increasing within
the process (`max(Date.now(), last + 1)`). The same probe then passed 3/3. This covers all 15 callers.

**What it means for the other two.** An empty Sequelize message is how Jest shows a database
error here, and the Postgres log names it. When the `TRUNCATE` failure or the parse error recurs,
read the "Stop containers" step (CI) or `docker compose logs db` (locally) before anything else.

The API was checked for the same collision. `CreateMetricLog` also stamps a missing `loggedAt` with
`new Date()`, but it checks for an existing log at that timestamp and answers 409, and a race past
that check becomes a `UniqueConstraintError`, which the error middleware maps to 409 as well. That
is the intended one-log-per-timestamp rule, handled without a 500, so no change.

## The `TRUNCATE` failure, explained (2026-09-29)

On `fix/npm-audit-findings`, the first full `npm test` on Node 24.21.0 failed `auth.test.ts` ›
prevents duplicate registrations in the `TRUNCATE` at `jest.setup.ts:88`, with an empty Sequelize
message: the same signature as the second failure above. Two further full integration runs passed
(202 passed, 5 skipped).

`docker compose logs db` held the real error:

```
ERROR:  deadlock detected
DETAIL:  Process 292629 waits for AccessExclusiveLock on relation 17220; blocked by process 292630.
         Process 292630 waits for RowShareLock on relation 16916; blocked by process 292629.
         Process 292629: TRUNCATE TABLE "users" RESTART IDENTITY CASCADE;
         Process 292630: INSERT INTO "public"."email_verification_tokens" (...)
```

In `lakira_test_db`, relation 16916 is `users` and 17220 is `email_verification_tokens`
(resolved from `pg_class`).

**Cause.** The integration project runs `--runInBand`, so the insert cannot come from a parallel
suite. It is the register handler's fire-and-forget verification email:
`src/features/shared/auth/infrastructure/http/controller.ts:85` calls
`requestEmailVerification.execute(...)` without awaiting it and responds 201. The test ends, the
next test's `beforeEach` truncates `users` with `CASCADE`, and the still-running token insert,
which holds a lock on `email_verification_tokens` and needs one on `users` for its foreign key,
deadlocks with it. Postgres kills the `TRUNCATE`. The resend handler (`controller.ts:243`) has the
same shape.

**Not fixed here**, since it was out of scope for a dependency change. Options, for whoever
takes it: have the setup wait for in-flight background work before truncating, or make the
fire-and-forget calls observable to tests (for example, a tracked promise the test harness can
drain). Changing the handler to await the email would alter the API's latency contract and is a
product decision, not a test fix.

## The parse error, second occurrence (2026-09-29)

During the `saas-gold-reaudit` gate runs, on Node 24.21.0 at `b12ec62`, the **first
`npm run test:integration` after a fresh `npm ci`** failed one test:

```
● Analytics HTTP caching › rejects an unsupported bucket
  Parse Error: Expected HTTP/, RTSP/ or ICE/
```

Two further full integration runs passed (202 passed, 5 skipped). The details the section above
asks for when it recurs: Node 24.21.0; the first run after an install; **a different test** from
the first occurrence (`metric-settings.test.ts`). Both occurrences are now first-run-after-install,
and none has been seen on Node 20 (three runs there, all before the first occurrence). Unlike the
`TRUNCATE` failures, the database is not involved: over the run's window (04:18 to 04:20 UTC),
`docker compose logs db` shows only duplicate-key errors on `processed_messages_pkey` and
`uq_metric_settings_metric`, the same two kinds logged during the 2026-09-28 runs, and no deadlock.
The bytes that are not an HTTP status line reach `llhttp` in the test process itself.

The `TRUNCATE` deadlock's cause is now audit finding R3 (P2) in `audit-2026-09-29.md` §6, and
test-database isolation is graded Partial there on the strength of it.

## A fourth failure, explained and fixed (2026-09-30)

Fork Smoke run `36695083548` (PR #124, `pull_request` event, attempt 1) failed the same test,
`MetricReadRepoSequelize.integration.test.ts` › limits logs when fetching metric detail, with
`[20, 30]` instead of `[30, 20]`. The rerun passed.

**Cause.** The 2026-09-27 fix made the fixture's `loggedAt` unique, but the query under test
ordered by `createdAt DESC` with a `LIMIT`. `createdAt` is stamped by Sequelize at insert time and
still collides within a millisecond, and Postgres returns tied rows in any order. The defect was in
the query, not the fixture: it also ranked a backfilled log as the newest.

**Fix.** Kit
[`deterministic-query-ordering`](../initiatives/deterministic-query-ordering/README.md) and
ADR-0052: log queries order by `loggedAt`, then `id`, and every ordered query that feeds a limit
ends with `id`. The test now inserts logs out of `loggedAt` order, fails every time on the old
query, and passed 20 of 20 runs on the new one.

## The `TRUNCATE` failure, fixed (2026-10-02)

Kit [`drainable-background-work`](../initiatives/drainable-background-work/README.md) and ADR-0054.
The verification email in `register` and `resendVerification` now goes through `runInBackground`
(`src/utils/background-tasks.ts`), and `jest.setup.ts` drains that work before every `TRUNCATE` and
before closing the database. Shutdown drains it too.

Two new tests in `auth-verify.test.ts` hold the email open and check that the drain waits for it;
both failed against the old controller. Five consecutive full integration runs on Node 24.21.0
passed (219 passed, 5 skipped each), and `docker compose logs db` over that window shows no
`deadlock detected` — only the two duplicate-key kinds noted above.

This closes the `TRUNCATE` part only. The parse error is a different failure and stays open; audit
finding R3 stays open in the audit until a dated run confirms the fix (ADR-002).

## 2026-10-03 — not seen in the dated run

The dated run of 2026-10-03 ran `npm test` as the first run after `npm ci` on Node 24.21.0, the
condition both earlier sightings shared, and it passed. Five other full runs the same day also
passed. The parse error is still unexplained, and this todo stays open (audit R4).

## The parse error, third occurrence (2026-10-05)

On `fix/limiter-logs-email-address`, one full `npm run test:integration` on Node 24.21.0 failed one
test:

```
● Auth Refresh Token Flow › POST /auth/logout revokes the refresh token family
  Parse Error: Expected HTTP/, RTSP/ or ICE/
```

The details this todo asks for: Node 24.21.0; **not** the first run after an install
(`node_modules` was last installed days earlier, and the same suite had passed in full the day
before on `fix/dashboard-latest-value-tiebreaker`); a third different test
(`auth-refresh.test.ts`). The branch changes two limiter log lines, and integration tests run with
`DISABLE_RATE_LIMITING=true`, so the change under test is not on the request's path. The next full run of the suite, on the same
tree plus test and doc edits, passed (220 passed, 5 skipped).

This removes the one thing the first two sightings shared. "First run after an install" is no
longer a condition for the failure.
