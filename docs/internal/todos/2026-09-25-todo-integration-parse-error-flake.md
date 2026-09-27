# Todo — intermittent `Parse Error: Expected HTTP/` in the integration suite

- **Status:** Open — the parse error and the `TRUNCATE` failure are still unexplained; a third
  failure was explained and fixed on 2026-09-27 (see the last section)
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
