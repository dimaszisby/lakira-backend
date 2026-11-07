# Observability Foundations

## Overview

Adds the four observability primitives the audit identified as missing: request-ID propagation across logs, Winston-level redaction of sensitive payloads, a Sentry hook for production error capture, and a real readiness probe (`/ready`) that pings Postgres + Redis. APM/metrics (`prom-client`, OpenTelemetry) is explicitly deferred to a future P2 kit.

- **Owning squad / DRI:** @dimaszisby
- **Files most affected:** `src/server.ts`, `src/utils/logger.ts`, `src/shared/middleware/error.ts`, `src/config/zodEnv.ts`.

## Scope

**In scope:**

- Async-context-based request-ID middleware (no extra runtime dep — uses Node's built-in `AsyncLocalStorage`).
- Winston format function that walks log meta and masks values whose key matches the existing sensitive-key regex.
- Sentry init in `src/server.ts` gated by `SENTRY_DSN`. `Sentry.captureException` for 5xx in `errorHandler`.
- Liveness vs. readiness split: `/api/v1/health` stays as liveness (no deps), new `/api/v1/ready` pings Sequelize + Redis with a 2 s budget.
- Move `SENSITIVE_KEY_PATTERN` from `src/config/envManager.ts` into a shared module so the redactor can reuse it.

**Out of scope:**

- Prometheus / OpenTelemetry (P2-5.4).
- Log shipping to Datadog/Loggly/CloudWatch (out of scope). ~~Winston file transports stay.~~
  **Superseded 2026-08-23 by [ADR-0041](../../../explanation/decisions/adr-0041-logs-as-event-streams-on-stdout.md):**
  the file transports are removed and the app writes to stdout only. Shipping remains out of scope —
  collection is the platform's responsibility.
- APM tracing.

## Commands & Tooling

- `npm run typecheck && npm run lint`
- `npm run test:unit -- logger`
- `npm run test:unit -- middleware/request-id`
- `npm run test:integration -- ready`
- After changes: `npm run docs:openapi:generate` (the `/ready` endpoint joins the spec).

## Verification

- A single request flows through the app and every log line for that request shares the same `requestId`.
- A logger call passing a `RESEND_API_KEY` in meta emits `***REDACTED***`.
- Booting with `SENTRY_DSN=""` or unset is a no-op (no init, no calls). Booting with a valid DSN connects.
- `/api/v1/ready` returns 503 when Postgres is down; 200 when both deps are reachable.
- `/api/v1/health` continues to return 200 even when Postgres is down (liveness, not readiness).

## References

- [Plan](./observability-plan.md)
- [Checklist](./observability-checklist.md)
- [Decisions](./decisions.md)
- **Closes audit gaps:** [P0-5.1] (request-ID), [P1-5.2] (Sentry), [P1-5.3] (readiness probe), [P1-4.3] (Winston redaction) in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`.
- **Owning ADRs:** ADR-005 (phase order) in `docs/internal/audits/saas-readiness/decisions.md`; (kit-local) ADR-001 (ALS vs cls-rtracer), ADR-002 (Sentry init lifecycle), ADR-003 (sensitive-keys module location) in `./decisions.md`.
- **Effort:** M (4 distinct sub-tasks, all S individually but they touch the same files).
- **Status:** Done — shipped in #42 (`a26d36c`).
- **Predecessor / dependency:** None — can run parallel to Phase 1 (JWT/refresh tokens). The Phase 1 `InvalidTokenError` will end up flowing through the Sentry-aware `errorHandler` once both ship.
