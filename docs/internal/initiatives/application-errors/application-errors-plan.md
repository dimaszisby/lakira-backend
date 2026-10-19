# Application errors — Plan

- **Status:** Done (merged in #185, `98f17f6`)
- **Appetite:** 1 day — past that, cut the docs polish, never the guarantees
- **Date:** 2026-10-19

## Context and goals

Register row B-30, from audit A0929 R7 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md`,
carried in A12 § 4.3). The application layer speaks HTTP in three ways:

1. 85 `new AppError(message, status)` in 37 `application/` files across all six features: 19 × 400,
   18 × 401, 6 × 403, 23 × 404, 10 × 409, no 5xx.
2. `GenerateDummyMetricLogsHandler` decides a job is terminal from `AppError` statuses 401, 403 and
   404, raised by `validateMetricAccess` in `src/utils/db-helper.ts`.
3. The login-lockout policy lives in the controller: it records a failed attempt only when
   `err instanceof AppError && err.statusCode === 401`. Converting `LoginUser` alone would silently
   stop counting failed logins, and the Redis lockout suite is skipped by default.

The vocabulary already exists: `DomainError` with five kinds and `ValidationError`
(`src/shared/domain/errors/DomainError.ts`), mapped to statuses in one table in
`src/shared/middleware/error.ts` (feature-boundaries D-06). Every throw fits one of the five kinds,
so when this lands no response changes and the application layer names what went wrong, not which
HTTP status to answer.

## Acceptance criteria

- **AC-1** — No file under `src/features/*/*/application/**` or `src/shared/application/**`
  imports `AppError`, and lint rejects one in every spelling.
  _Why:_ R7; a rule that is not enforced drifts back, as the domain one did before C4.
- **AC-2** — Every response is unchanged: the integration suite passes with no edit to an
  integration test, and the OpenAPI spec shows no drift.
  _Why:_ this is a refactor; the frontend depends on every status and message.
- **AC-3** — A wrong password or unknown email still records one failed attempt, with the email as
  the controller passed it; a success resets; a no-membership 403 does neither.
  _Why:_ R7's third part, and the regression this change could cause silently.
- **AC-4** — An ownership 401, 403 or 404 still parks a dummy-logs job; any other failure retries.
  _Why:_ R7's second part; parking wrongly loses work, retrying wrongly costs a delay (ADR-0005).
- **AC-5** — The error handler answers each of the five kinds with its status and the error's
  message, and the log line keeps `kind`.
  _Why:_ the mapping table is now on the path of every application error.

## Open questions

None.

## Out of scope

- `AppError` in infrastructure: HTTP middleware and controllers may speak HTTP; five persistence
  adapters throw it too, recorded in the ADR as a remainder.
- B-35: a 4xx logged at error level with a stack. Log levels do not change here.
- The other items of `2026-10-11-todo-apperror-lint-rule-review-leftovers.md` (B-28); item 4 is
  fixed in passing.

## Decisions expected

- The application's error vocabulary (D-01).
- The lint boundary (D-02).
- How terminality is decided (D-03).
- Where the lockout policy lives (D-04).

## Phases

### Phase 0 — kit and branch

### Phase 1 — vocabulary and sweep

Four subclasses beside `ValidationError`: `UnauthorizedError`, `ForbiddenError`, `NotFoundError`,
`ConflictError`. Every application throw converted by a reviewed script, messages byte for byte,
then read file by file.

### Phase 2 — the two policies

`validateMetricAccess` throws the subclasses; the dummy handler parks by kind. `LoginUser` takes a
`LoginAttemptsPort` and records or resets itself; the controller keeps the lockout check and its
`Retry-After` header.

### Phase 3 — enforcement and tests

The `AppError` lint pattern applied to both application layers, its message citing a section that
names it; lint tests; unit tests moved from status codes to kinds.

## Risks and trade-offs

- The sweep touches many files at once. The integration suite, unchanged, is the check that no
  status or message moved.
- The lockout move changes who calls `recordFailedAttempt`. The Redis lockout suite is run locally
  with `ENABLE_REDIS_INTEGRATION=true`, since CI skips it.

## Rollback

Code only: revert the PR. No migration, no stored data, no response changes.

## References

- ADR-0044 and feature-boundaries D-06 (the domain's `DomainError`); ADR-0058 (layer lint rules);
  ADR-0005 (terminal messages park)
