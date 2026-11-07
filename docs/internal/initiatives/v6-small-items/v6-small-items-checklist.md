# V6: the smaller items of 2026-10-10 — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `41d09f7` (#207).

## Acceptance criteria

- **AC-1** — A 4xx `AppError` and a 4xx `DomainError` each log one warn line with no stack; a 5xx
  still logs at error. _Why:_ V6 item 1, reproduced on 2026-10-20.
- **AC-2** — An unhandled rejection's line carries its reason, for an `Error` and for a string.
  _Why:_ V6 item 2, reproduced on 2026-10-20.
- **AC-3** — A pattern invalidation logs one line, however many SCAN pages it takes. _Why:_ V6
  item 3.
- **AC-4** — `If-None-Match` holding the ETag in a list, with `W/`, or `*` gets a 304; a list
  without it gets a 200. _Why:_ V6 item 4.
- **AC-5** — No file under `analytics/application/` imports `envManager`. _Why:_ V6 item 5.
- **AC-6** — The domain's bucket type, `BucketAggregate`, names no SQL column. _Why:_ V6 item 6.
  (Narrowed from "no type in `analytics/domain/`": see Discovered.)
- **AC-7** — The OpenAPI spec is unchanged, and every gate passes. _Why:_ no contract change.

**Out of scope.** V6 item 7, the trends route's limiter, joins B-81's X9 ("reads have no per-route
limiter"), which waits on the owner. Item 8, two stale comments, is named by neither run and is not
pursued. B-36's "Error Occurred: undefined" for a thrown non-Error stays B-36's.

## Phase 0 — kit and branch

- [x] `fix/v6-small-items` cut with `--no-track` from `origin/dev` at `41d09f7`; HEAD and upstream
      verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-05
- [x] #207's loose ends: `dto-and-display-options-polish` D-01 to D-03 Accepted, README Done; the
      register's B-33 Closed row names `#207 (41d09f7)`; "As of" `41d09f7`

## Phase 1 — tests first, each seen to fail

- [x] `error-log-lines.test.ts` › a 4xx `AppError` and a `NotFoundError` each write one warn line
      with no stack (AC-1)
- [x] `logger` test › `logUnhandledRejection` writes an `Error`'s message and a string reason (AC-2)
- [x] `redis-client.test.ts` › a two-page scan logs one line with the total (AC-3)
- [x] `analytics-caching.test.ts` › list, weak and `*` give 304; a list without the ETag gives 200
      (AC-4). **Not red:** they passed before the change, since Express's `res.send` applies
      `req.fresh` itself; see D-03's amendment
- [x] `series-stats.test.ts` on the camelCase input (AC-6)

## Phase 2 — the change

- [x] `src/shared/middleware/error.ts`: resolve `appError` first, log by its status (D-01);
      `src/utils/AppError.ts` sets `name`
- [x] `logUnhandledRejection` in `src/utils/logger.ts`; `server.ts` and `worker.ts` call it (D-02)
- [x] `invalidateCacheByPattern` counts across pages and logs once
- [x] Both analytics handlers answer 304 on `req.fresh` (D-03)
- [x] Limits through `analytics/feature.ts` into both queries (D-04)
- [x] `BucketAggregate` fields renamed; the repository maps rows (D-05)

## Phase 3 — gates, review, docs

- [x] Review of the diff: one fix, `logUnhandledRejection` had landed between `flushLogs` and its
      doc comment; moved above it. No defect otherwise. `AppError`'s new `name` is compared nowhere
      in `src/`
- [x] Docs: `read-application-logs.md` (the 4xx line, the rejection line, one line per scan);
      ADR-0033 amended (D-04). ADR-0057's "logs every throttled request at error as `Error Occurred`"
      describes the code it was decided against and is left as written
- [x] Register: B-35 to Closed, naming the branch; B-87 added. B-81 unchanged: its X9, "reads
      have no per-route limiter", already covers the trends route, a read
- [x] Notion Part 2: none. No route, schema or response body changes

## Discovered

- [x] Found: `DashboardVizItem` in `analytics/domain/types.ts` carries `category_name`,
      `category_icon` and `category_color`, the published field names of the dashboard response →
      out of scope, since renaming them changes the contract the frontend reads; filed as
      `docs/internal/todos/2026-10-22-todo-dashboard-item-snake-case-category-fields.md`, register
      row B-87. AC-6 narrowed to the type V6 names
- [x] Found: `analytics/feature.ts` said `getMetricTrend` was "not yet exposed via router"; metric's
      router serves it at `/metrics/:metricId/trends` → in scope, a file this kit changes; the
      comment now says where it is served. It may be one of V6's two unnamed stale comments, which
      no source confirms
- [x] Found: V6 item 4 was not observable. Express's `res.send` answers 304 on `req.fresh`, so the
      exact-string check only missed an early exit → in scope; D-03 amended, the `req.fresh` line
      kept
- [x] Found: `fresh` 0.5.2, which Express's `req.fresh` uses, already compares a list weakly with
      `*` → in scope; D-03 revised before any code to use it instead of a parser of our own

## Acceptance

- [x] AC-1 — `error-log-lines.test.ts` › logs a 4xx from an AppError / a DomainError as a client
      error; still logs a 5xx AppError at error level, with its stack
- [x] AC-2 — `logger-unhandled-rejection.test.ts` › writes an Error reason's message and stack;
      writes a reason that is not an Error
- [x] AC-3 — `redis-client.test.ts` › logs one line with the total across pages; logs one line
      when nothing matches
- [x] AC-4 — `analytics-caching.test.ts` › If-None-Match (four cases); held before the change too
      (D-03)
- [x] AC-5 — `grep -rn envManager src/features/public/analytics/application` is empty
- [x] AC-6 — `series-stats.test.ts` on `{ average, min, max, count }`; `typecheck`
- [x] AC-7 — `docs:openapi:check` clean, the spec unchanged; the gates below

## Gates

Node 24.22.0; integration against throwaway Postgres 18 and Redis 7, migrated with `migrate:test`.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 150 suites, 1537 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 303 tests passed (6 skipped),
      thresholds met
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
