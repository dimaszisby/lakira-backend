# Application errors — Checklist

## Phase 0 — kit and branch

- [x] `refactor/application-errors` cut with `--no-track` from `origin/dev` at `975de82`; HEAD and
      upstream verified
- [x] `README.md`, `application-errors-plan.md`, this file
- [x] `decisions.md` D-01 to D-04

## Phase 1 — vocabulary and sweep

- [x] `src/shared/domain/errors/DomainError.ts` — `UnauthorizedError`, `ForbiddenError`,
      `NotFoundError`, `ConflictError`
- [x] Every `new AppError(…)` under `src/features/*/*/application/**` converted, messages unchanged;
      no `AppError` import left there

## Phase 2 — the two policies

- [x] `src/utils/db-helper.ts` `validateMetricAccess` — throws the subclasses
- [x] `GenerateDummyMetricLogsHandler` — parks on kinds `unauthorized`, `forbidden`, `not_found`
- [x] `application/ports/LoginAttemptsPort.ts`; `LoginUser` records and resets; `feature.ts` adapts
      the lockout functions; the controller keeps the check and `Retry-After` only

## Phase 3 — enforcement and tests

- [x] `eslint.config.mjs` — the `AppError` pattern in both application blocks, message reworded
- [x] `__tests__/unit/feature-boundaries.lint.test.ts` — application-layer cases
- [x] Unit tests asserting `statusCode` on use-case errors moved to kinds
- [x] `LoginUser.test.ts` — the lockout policy; the controller test reduced to the check

## Discovered

- [x] Found: 27 test files asserted `AppError` or a `statusCode`, not 11 → in scope; `toBeInstanceOf`
      took the exact class Jest reported for each line, `statusCode` became `kind` by the table
- [x] Found: one test mocks the invite repository's 409 `AppError`, which still passes through
      unchanged from infrastructure → in scope, its assertion stays on `statusCode`
- [x] Found: `GenerateDummyMetricLogsHandler` had no unit test → in scope,
      `GenerateDummyMetricLogsHandler.test.ts` covers which kinds park and which retry
- [x] Found: five persistence adapters and one mapper throw `AppError` → out of scope (R7 is the
      application layer), recorded in ADR-0068 § Consequences

## Acceptance

- [x] AC-1 — lint on `src` clean; `feature-boundaries.lint.test.ts` › "the domain and application
      layers import no AppError" (both layers, every spelling)
- [x] AC-2 — 255 integration tests passed with no integration test edited; OpenAPI no drift;
      contract quick profile 36 passed, the same two known warnings. Before and after, all 85 throws
      have the same file, message and status
- [x] AC-3 — `LoginUser.test.ts`; `auth-lockout.test.ts` with `ENABLE_REDIS_INTEGRATION=true`
      passed, and failed with `recordFailure` removed
- [x] AC-4 — `GenerateDummyMetricLogsHandler.test.ts`; the queue integration test's terminal case
      passed unchanged
- [x] AC-5 — `domain-error-envelope.test.ts` › each class answers its status and message; the
      contract run's log lines carry `kind`

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests (and the lockout suite with `ENABLE_REDIS_INTEGRATION=true`)
- [x] build
- [x] OpenAPI
- [ ] security delta — skipped: no dependency changes
- [ ] image smoke — skipped: no Dockerfile or dependency changes
