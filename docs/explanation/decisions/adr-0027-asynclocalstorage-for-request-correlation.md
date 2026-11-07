# ADR-0027 — AsyncLocalStorage for request correlation, not cls-rtracer

- **Status:** Accepted
- **Date:** 2026-05-06
- **Origin:** `ADR-001` in the Observability kit — [`observability`](../../internal/initiatives/observability/decisions.md)
- **Note:** originally logged as _Implemented_.

---

## Context

Audit gap [P0-5.1] requires per-request log correlation. Two common options: a third-party library like `cls-rtracer` that wraps `cls-hooked`, or Node's native `AsyncLocalStorage` (stable since Node 16). The repo runs on Node 20.

## Decision

Use the built-in `AsyncLocalStorage` from `node:async_hooks`. Export a singleton store from `src/shared/middleware/request-id.ts` and have the request-ID middleware run the rest of the chain inside `store.run(reqId, () => next())`.

## Options considered

- _`cls-rtracer`._ Adds a runtime dependency and a maintenance burden for a feature Node now exposes natively. Rejected.
- _Echo `req.id` into a logger child instance per-request._ Rejected: requires every log call site to use the child logger. Misses any indirect logger usage (e.g., from a use case called by a controller).
- _Just set a header and a `req.id` property without an async store._ Rejected: code paths several `await`s deep cannot read `req.id` without threading it through every function signature.

## Consequences

- Zero new runtime deps.
- Anywhere in the call tree that needs the current request ID (logger format, Sentry tags, future tracer): `requestIdStorage.getStore()`.
- The worker process (`src/worker.ts`) gets the same primitive but with a per-message store rather than per-request. Track that as a follow-up; do not block this kit.

> **2026-10-14:** an incoming `x-request-id` is used only when it is 1 to 64 characters of
> `[A-Za-z0-9._-]`; anything else, a header sent twice included, is replaced by a minted UUID and
> neither echoed nor logged. Until then any non-empty value was taken, so a caller could put text
> of any length on every log line of its request and on its Sentry event (register row B-14; kit
> [`observability`](../../internal/initiatives/observability/decisions.md), D-05).

## Links

- `audit-2026-05-01.md` § [P0-5.1]
- `src/shared/middleware/request-id.ts` (to be created)

---
