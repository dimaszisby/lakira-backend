# ADR-0034 — CORS_ORIGIN accepts a comma-separated allowlist

- **Status:** Accepted
- **Date:** 2026-05-22
- **Origin:** `ADR-007` in the SaaS readiness audit kit — [`saas-readiness`](../../internal/audits/saas-readiness/decisions.md)

---

## Context

Audit gap P2-4.5 in `audit-2026-05-20.md`: `CORS_ORIGIN` was a single `string`, so a deployment could only whitelist one origin. Multi-surface SaaS bases (app + admin + marketing) need more than one. This was the last Partial item keeping Category 4 (Security) below the 80% threshold from ADR-001 exit criterion #3 — closing it flips Cat 4 to ≥80% and the ADR-001 fork-ready verdict from FAIL → PASS.

## Decision

Keep the env var name `CORS_ORIGIN`. Parse its value in `src/config/zodEnv.ts` as a comma-separated list, trimming whitespace and dropping empty entries, transforming the schema output type from `string | undefined` to `string[] | undefined`. In `src/server.ts`, pass the parsed array directly to `cors({ origin })` — the `cors` lib natively matches against `string[]` and echoes the matched origin back per request. When the list is empty/undefined, fall back to `["http://localhost:3000"]`. Env read uses `loadEnvOrExit()` at the use site per `.claude/rules/environment.md`.

## Options considered

- _Introduce `CORS_ORIGINS` (plural) and deprecate the singular._ Rejected: a breaking env-var rename for every existing deployment to gain nothing — comma-separated parsing covers the single-origin case identically.
- _Use an `origin` callback function instead of an array._ Rejected: the `cors` lib's native array handling already does case-sensitive exact matching and per-request echoing; a hand-written callback would duplicate that logic with more code and no behavior change.

**Backwards compatibility:** A single-origin value (e.g., `CORS_ORIGIN=https://app.example.com`) still parses cleanly — it produces a 1-element array. No existing deployment needs to change its env to keep working.

## Consequences

- Closes P2-4.5 → Cat 4 reaches the ≥80% bar → ADR-001 exit criterion #3 passes → repo is fork-ready by the strict reading of ADR-001.
- `CORS_ORIGIN` schema output type changes from `string | undefined` to `string[] | undefined`. The only consumer is `src/server.ts`; no other call sites read it.
- `.env.example` updated to demonstrate the multi-origin form.

**Future tuning (non-blocking, deferred):** Surfaced during code review of this ADR; not required to close P2-4.5, captured here so the next person touching CORS doesn't re-discover them.

- `__tests__/integration/middleware/cors.test.ts` — add a one-line comment inside `buildAppWithCors()` explaining the `withTestEnv` → `resetEnvCacheForTesting()` → `loadEnvOrExit()` cache cycle, so future readers don't wonder why a mini-app is rebuilt per test instead of importing the main `app`.
- `.env.example` — optionally show the single-origin form alongside the multi-origin example for discoverability, e.g. a commented `# CORS_ORIGIN=https://app.example.com` line above the active multi-origin one.

## Links

- `audit-2026-05-20.md` § P2-4.5
- `decisions.md` § ADR-001 (the fork-ready gate this closes)
- `src/config/zodEnv.ts` (CORS_ORIGIN schema)
- `src/server.ts` (cors() wiring)
- `__tests__/integration/middleware/cors.test.ts` (allowed / disallowed / single-origin / whitespace coverage)

---
