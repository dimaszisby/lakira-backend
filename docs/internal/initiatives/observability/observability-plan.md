# Observability Foundations — Plan

## Context & Goals

The 2026-05-01 audit found four observability gaps that compound at runtime: no request correlation (P0-5.1), no Sentry hook (P1-5.2), `/health` is a liveness probe pretending to be readiness (P1-5.3), and Winston has no redaction filter despite the project standard documenting one (P1-4.3). The first production incident at any fork hits all four walls at once. This plan ships them as one cohesive change because they all touch `src/server.ts`, `src/utils/logger.ts`, and `src/shared/middleware/error.ts`.

Goal: every production log line carries a `requestId`, no sensitive value reaches a transport, 5xx responses are captured by Sentry when configured, and the orchestrator can distinguish "process alive" from "ready to serve traffic."

## Type definitions

- **Liveness:** "the process is up." Cheapest possible response. Used by orchestrators to decide whether to restart a container.
- **Readiness:** "the process is up AND its dependencies are reachable." Used by orchestrators to decide whether to route traffic. Returning 503 here removes the instance from the pool without restarting it.
- **Redaction:** mask values, not keys. The key (e.g., `password`) stays in the log so the structure is grep-able.

## Phases

### Phase 0 — Sensitive-keys module + Winston redaction format (closes P1-4.3)

1. Create `src/config/sensitive-keys.ts` exporting `SENSITIVE_KEY_PATTERN = /(password|secret|token|key|certificate|url)$/i`.
2. Update `src/config/envManager.ts` to import from there (removing the local copy).
3. Add `redactSensitive` Winston format in `src/utils/logger.ts`. Walks the log info object recursively; for any key matching `SENSITIVE_KEY_PATTERN`, replace its value with `"***REDACTED***"`. Bail at depth 5 to avoid pathological recursion.
4. Insert it in the format chain BEFORE `format.json()` so the redacted shape is what hits stdout. (File transports were removed by ADR-0041; stdout is the only sink.)
5. Unit test: pass `{ password: "p", token: "t", email: "e" }` to the redactor; assert `password` and `token` are masked, `email` is not.

### Phase 1 — Request-ID middleware (closes P0-5.1)

1. Create `src/shared/middleware/request-id.ts` exporting:
   - `requestIdStorage = new AsyncLocalStorage<string>()` (Node built-in, no dep).
   - `requestIdMiddleware(req, res, next)` — read `x-request-id` header; if absent or malformed, mint `crypto.randomUUID()`. Attach to `req.id`, set response header `x-request-id`, and run the rest of the chain inside `requestIdStorage.run(reqId, () => next())`.
2. Insert in `src/server.ts` AFTER body parsing but BEFORE the global rate limiter (line ~80–88 region in current file).
3. Add a Winston format `attachRequestId` that reads from `requestIdStorage.getStore()` and adds `requestId` to log meta. Insert in the chain before `redactSensitive`.
4. Unit test: send two requests with different `x-request-id` headers; assert each request's logs carry the correct ID and the response header echoes it.
5. The worker (`src/worker.ts`) gets the same redactor + storage but the request-ID is generated per RabbitMQ message-handler call rather than per HTTP request. That is a follow-up; do not block this phase on it.

### Phase 2 — Sentry hook (closes P1-5.2)

1. `npm install @sentry/node` (production dep). Pinned in `package.json` to a 7.x or 8.x line — pick the latest stable at install time and record in ADR-002.
2. Add `SENTRY_DSN` (optional string) and `SENTRY_TRACES_SAMPLE_RATE` (optional number, default `0`) to `src/config/zodEnv.ts`.
3. At the very top of `src/server.ts`, after env loading, if `env.SENTRY_DSN` is set call `Sentry.init({ dsn, tracesSampleRate, environment: env.NODE_ENV })`.
4. In `src/shared/middleware/error.ts`, after the existing 5xx branch but before sending the response, call `Sentry.captureException(err, { tags: { requestId: requestIdStorage.getStore() } })`. Skip for 4xx, ZodError, and `AppError` with status < 500.
5. Add an environment-aware test: with `SENTRY_DSN=""` the `init` call must not fire (asserted by spying on `Sentry.init`).

### Phase 3 — Readiness probe (closes P1-5.3)

1. Keep `GET /api/v1/health` as-is. It is the liveness probe. Return `{ status: "ok", environment, timestamp }`.
2. Add `GET /api/v1/ready` — runs `Promise.allSettled([sequelize.authenticate(), redisClient.ping()])` with a 2-second timeout (use `Promise.race` against `setTimeout`). Returns 200 with `{ status, checks: { db: "ok"|"fail", redis: "ok"|"fail" } }` when both succeed; returns 503 with the same shape and details when either fails.
3. Mount `/api/v1/ready` BEFORE the global rate limiter (same as `/health`) so an overloaded instance still answers.
4. Update Render health-check config to point at `/api/v1/ready` (document, do not change deployment unilaterally — pair with Phase 7's deploy work).
5. Integration test under `__tests__/integration/health/ready.test.ts`: with the real DB up, expect 200 + both ok. Stop the DB container temporarily in a separate test (or mock `sequelize.authenticate` to throw) and expect 503 with `db: "fail"`.

## Risks, trade-offs, rollback

- **AsyncLocalStorage performance.** ALS adds a per-request overhead, but it is `O(1)` and used by Express itself in newer versions. If profiling later shows hot-path impact, fall back to a `req.id` echo in the logger meta-merge layer (no global context). Documented in ADR-001.
- **Sentry with no DSN must be a true no-op.** If `Sentry.init` were called with an empty string, it would still install the global handlers. Gate strictly on `if (env.SENTRY_DSN)`. Test the no-op explicitly.
- **Readiness 503 cycles.** A flaky DB ping under load could cause Render to thrash. Mitigation: 2-second budget + only fail readiness if BOTH attempts in a 5-second window failed (debounce — to be added later if observed).
- **Rollback for any phase:** every change is additive and gated by an env var or by being a new endpoint. Reverting a single commit per phase restores prior behavior with zero migration.

## Success metrics

- Every log emitted from a request carries the same `requestId` as the response header.
- A log call passing a key matching `SENSITIVE_KEY_PATTERN` is masked.
- With `SENTRY_DSN` set, an unhandled 500 produces a Sentry event tagged with `requestId`.
- `/api/v1/ready` returns 503 when Postgres is down and 200 when both deps are reachable; `/api/v1/health` keeps returning 200 in both cases.
- Audit re-run marks P0-5.1, P1-5.2, P1-5.3, P1-4.3 as Pass.
