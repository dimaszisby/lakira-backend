# ADR-0021 — Sentry init lifecycle: top of server.ts, env-gated

- **Status:** Accepted (2026-09-24 — implementation verified in code; see the status note)
- **Date:** 2026-05-02
- **Origin:** `ADR-002` in the Observability kit — [`observability`](../../internal/initiatives/observability/decisions.md)

> **Status note (2026-09-24).** Moved from Proposed by the `docs-sweep` kit
> ([D-03](../../internal/initiatives/docs-sweep/decisions.md)): the decision below is in the code.
> Evidence: `Sentry.init` in `src/server.ts`, gated on `env.SENTRY_DSN`, with `environment` and
> `release`; `errorHandler` captures 5xx only and tags `requestId`. Events pass through
> `scrubSentryEvent` first (added later by the log-redaction-coverage kit).

---

## Context

Audit gap [P1-5.2] asks for Sentry as a hook point. The choice is where to call `Sentry.init` and how to gate it so dev runs are unaffected.

## Decision

1. Install `@sentry/node` (record the pinned version here once installed; placeholder: `^8.x`).
2. Init at the top of `src/server.ts` immediately after `loadEnvOrExit()`. Pre-init means later `import` side effects can already be captured.
3. Strict gate: `if (env.SENTRY_DSN) { Sentry.init({...}) }`. An unset or empty DSN is a true no-op — no global handlers installed, no network calls.
4. `tracesSampleRate` defaults to `0` (no APM tracing); flip to a small fraction in production via env if/when traces become useful.
5. Capture only in `errorHandler` for 5xx responses. 4xx, `ZodError`, and `AppError` with status < 500 are user-driven and would drown signal.
6. Tag every captured event with `{ requestId, environment, route }`.

## Options considered

- _Init only in production._ Rejected: staging is the most useful environment for catching regressions; gate by DSN, not `NODE_ENV`.
- _Capture all errors including 4xx._ Rejected: validation errors are not actionable; they would dominate the error feed.
- _Use Sentry for tracing too._ Deferred: APM/tracing is its own (P2-5.4) decision and likely Prometheus + OpenTelemetry, not Sentry traces.

## Consequences

- One new prod dep.
- One new env var (`SENTRY_DSN`) added to `.env.example` once that file lands in Phase 0.
- `errorHandler` becomes Sentry-aware but stays the only error sink.

## Links

- `audit-2026-05-01.md` § [P1-5.2]
- `src/server.ts`, `src/shared/middleware/error.ts`

---
