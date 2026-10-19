# ADR-0068 — The application layer raises domain errors, not HTTP errors

- **Status:** Accepted (merged in #185, `98f17f6`)
- **Date:** 2026-10-19
- **Related:** [ADR-0044](./adr-0044-feature-boundaries-and-their-frozen-exceptions.md) and
  feature-boundaries D-06 (the domain's `DomainError`, which this extends);
  [ADR-0058](./adr-0058-inner-layers-and-shared-code-import-rules.md) (inner-layer lint rules);
  [ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md) (terminal messages park);
  [ADR-0032](./adr-0032-account-lockout-redis-sliding-window.md) (the login lockout)
- **Origin:** `D-01` to `D-04` in the application-errors kit —
  [`application-errors`](../../internal/initiatives/application-errors/decisions.md); register row
  B-30; audit A0929 R7

---

## Context

Audit R7 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md`) found the application layer
speaking HTTP three ways:

- **`AppError(message, statusCode)` in use cases.** 85 throws in 37 `application/` files across
  all six features: 19 × 400, 18 × 401, 6 × 403, 23 × 404, 10 × 409. A use case was deciding which
  status HTTP answers.
- **Queue terminality from status codes.** `GenerateDummyMetricLogsHandler` parked a job when the
  ownership check threw an `AppError` with status 401, 403 or 404.
- **The login-lockout policy in the controller.** It recorded a failed attempt when `LoginUser`
  threw an `AppError` 401, and reset the count after a success.

The domain had already left HTTP (caveat C4): entities throw a `DomainError` with a `kind`, and
`src/shared/middleware/error.ts` maps the kind to a status in one table. Every application throw
was one of the five kinds that table maps.

## Decision

1. **One vocabulary.** `src/shared/domain/errors/DomainError.ts` gains `UnauthorizedError`,
   `ForbiddenError`, `NotFoundError` and `ConflictError` beside `ValidationError`. Application
   code throws them; the error handler's existing table maps them. Every throw was converted with
   its message unchanged: a script compared each throw's file, message and resulting status before
   and after, and all 85 matched.
2. **Enforced.** The lint pattern that refused `AppError` in `domain/` (now
   `INNER_LAYER_HTTP_ERROR`) also covers `src/features/*/*/application/**` and
   `src/shared/application/**`, in every spelling; `feature-boundaries.lint.test.ts` proves each.
3. **Terminal by kind.** `validateMetricAccess`, which an application port reaches, throws
   `UnauthorizedError`, `NotFoundError` and `ForbiddenError`. The dummy-logs handler parks on the
   kinds `unauthorized`, `forbidden` and `not_found`; anything else retries, as before.
4. **The use case counts failed logins.** `LoginUser` takes a `LoginAttemptsPort` (`recordFailure`,
   `reset`). A wrong password or an unknown address records one failure, under the address as
   typed, then throws; a success resets; a no-membership 403 does neither. The controller keeps the
   lockout check and the `Retry-After` header on its 429, which are HTTP's.

## Options considered

- **A separate `ApplicationError` family.** A second vocabulary mapped by an identical table; two
  places to keep in step.
- **Keep `AppError` and lint only.** Does not remove what R7 found.
- **Match `UnauthorizedError` in the controller.** Keeps the lockout policy at the edge, which is
  R7's third part.
- **Translate HTTP errors back to kinds in `MetricAccessSequelize`.** Maps in the direction this
  removes.

## Consequences

- No response changes. The integration suite passed with no integration test edited, the OpenAPI
  spec shows no drift, and the contract gate's quick profile passed as before.
- A use-case test asserts a class or a `kind`, not a `statusCode`. Code that reacts to an error
  reads its kind.
- A log line for an application error carries `kind` and the class name instead of `statusCode`;
  the logger's allowlist already kept `kind`.
- The lockout counting moved, so the Redis lockout suite was run with
  `ENABLE_REDIS_INTEGRATION=true`. It passed, and it failed when `recordFailure` was removed. CI
  still skips it.
- **Remainder, outside R7:** infrastructure may throw `AppError`. HTTP middleware and controllers
  should. Five persistence adapters and one mapper do too, though nothing above them inspects the
  status: `OrganizationInviteRepositorySequelize`, `MetricLogRepoSequelize`,
  `MetricSettingsRepositorySequelize`, `MetricRepoSequelize`, `VisualizationReadRepoSequelize`
  and `MetricReadMapper`, plus the `db-helper` functions other than `validateMetricAccess`. Moving
  them is the same change, one layer out.

## Enforcement

- Lint: `INNER_LAYER_HTTP_ERROR` in `eslint.config.mjs`;
  `__tests__/unit/feature-boundaries.lint.test.ts` › "the domain and application layers import no
  AppError".
- `__tests__/unit/shared/middleware/domain-error-envelope.test.ts` — each of the five classes
  answers its status and message.
- `__tests__/unit/features/auth/application/LoginUser.test.ts` — what counts toward the lockout;
  `__tests__/integration/api/auth-lockout.test.ts` with Redis on.
- `__tests__/unit/features/metric-log/application/GenerateDummyMetricLogsHandler.test.ts` — which
  kinds park; `GenerateDummyMetricLogsQueue.integration.test.ts` › "parks a terminal failure at
  once".

## Links

- Kit: [`application-errors`](../../internal/initiatives/application-errors/README.md)
- Rules: `.claude/rules/architecture.md` § Dependency Rules; `.claude/rules/api-design.md` § Error
  Handling
