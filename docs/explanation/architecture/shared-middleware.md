# Shared Middleware Modules

- Timestamp: 2025-12-03T21:45:00Z

## Purpose

As part of the Phase 4 vertical slice migration we retired the legacy `src/middleware` folder. All cross-cutting middleware now lives alongside the features (auth) or inside `src/shared/middleware`. This document captures the new conventions so future slices follow the same pattern.

## Modules

| Concern              | Module                                                             | Notes                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth guard           | `src/features/shared/auth/infrastructure/http/authMiddleware.ts`   | Verifies the token, requires an active org membership, and sets `req.user` / `req.organizationId` / `req.membership`.                                                        |
| Rate limiting        | `src/shared/middleware/rate-limiter.ts`                            | `globalRateLimiter`, `userRateLimiter`, `analyticsRateLimiter`, `switchOrgRateLimiter`, and the password-reset / email-verification limiters, each with a `create*` factory. |
| Request validation   | `src/shared/middleware/validation.ts`                              | Exposes the `validate` middleware supporting both full-schema and bag mode; attaches `req.validated`.                                                                        |
| Cache responses      | `src/shared/middleware/cache.ts`                                   | Wraps Redis caching logic and logs cache hits/misses.                                                                                                                        |
| Role guard           | `src/features/shared/auth/infrastructure/http/assertHasOrgRole.ts` | `requireOrgRole(...roles)` middleware and `assertHasOrgRole(req, ...)`, reading `req.membership.role` (ADR-0030).                                                            |
| pickValidated helper | `src/shared/middleware/validated.ts`                               | Supplies the `pickValidated` helper used by controllers.                                                                                                                     |
| Error handler        | `src/shared/middleware/error.ts`                                   | Centralized error handler that hides stack traces in production.                                                                                                             |
| Request ID           | `src/shared/middleware/request-id.ts`                              | `requestIdMiddleware` and `getRequestId()` — AsyncLocalStorage correlation (ADR-0027).                                                                                       |
| Access log           | `src/shared/middleware/access-log.ts`                              | `accessLogMiddleware` (morgan) — one line per request, carrying the request id (ADR-0041).                                                                                   |
| Method guards        | `src/shared/middleware/method-guard.ts`                            | `methodNotAllowed([...])` (405) and `disallowTraceMethod`.                                                                                                                   |
| JSON body guard      | `src/shared/middleware/require-json-object.ts`                     | `requireJsonObjectBody()` — rejects non-object JSON bodies.                                                                                                                  |
| Malformed requests   | `src/shared/middleware/client-error.ts`                            | `attachClientErrorHandler(server)` — answers malformed HTTP at the socket level with the error envelope.                                                                     |

Each module exports both a default instance (e.g., `authMiddleware`, `globalRateLimiter`) and factory helpers (`createAuthMiddleware`, `createGlobalRateLimiter`, etc.) so tests/composition roots can override dependencies.

## Usage Guidelines

1. **Import directly from the feature/shared module.** Avoid introducing new wrappers under `src/middleware`.
2. **Prefer factories in tests.** When a test needs to override dependencies (e.g., swap the Redis client or user repo), use the exported `create*` helper.
3. **Document new middleware.** If you add additional shared middleware, update this document and the Phase 4 checklist so future engineers know where to look.
4. **Server wiring.** `src/server.ts` imports middleware from the modules above; additional server-level wiring should follow the same pattern.

## Migration Notes

- Legacy files under `src/middleware` have been deleted; path aliases referencing that folder were removed from `tsconfig.json` and `jsconfig.json`.
- Historical documentation pointing to `src/middleware/*` has been updated to reference the modules listed here.

## Cursor Cache Key Convention

- Timestamp: 2025-12-14T17:40:00+07:00

All cursor/list caches across feature slices must use the shared helper at `src/shared/cache/keys.ts`.

- `buildCursorCacheKey({ feature, version, userId, organizationId, segments })` generates keys in the format `cursor:<feature>:v<version>:<user>:org:<org>:<k1>:<v1>:...`. `organizationId` is required (ADR-0035), and `__tests__/unit/architecture.test.ts` fails the build if a cache-key template omits it. Missing values collapse to `_`, booleans serialize to `1/0`, and numeric input stays numeric.
- `cursorCacheNamespace(feature, versionOrWildcard)` returns the namespace prefix so invalidation logic can call `delByPattern` with strings such as `${cursorCacheNamespace("metric-logs", "*")}:${userId}:*`.
- Feature slices own their feature slug + version (e.g., metrics = `feature: "metrics", version: 1`; metric logs = `feature: "metric-logs", version: 2`). Bumping versions should happen alongside cache invalidation updates.
- Metric, metric-log, metric-settings, and metric-category routers/use cases now adhere to this convention; future cursor endpoints must do the same.

## Cache Invalidation Logging

- Timestamp: 2025-12-14T17:55:00+07:00

- Use `logCacheInvalidation(scope, context)` from `src/shared/cache/logging.ts` whenever a cache invalidation completes successfully. The helper emits a single `[CACHE] invalidate` debug log with the provided metadata.
- Use `logCacheInvalidationError(scope, error, context)` inside `catch` blocks to capture failures with the same scope/context payload; the helper logs via `logger.error`.
- Avoid slice-specific `logger.info` statements for cache invalidations—stick to the shared helper so log levels and payloads remain consistent across slices.

### Related Docs

- [Feature Boundary Rules](./feature-slice-ddd.md)
