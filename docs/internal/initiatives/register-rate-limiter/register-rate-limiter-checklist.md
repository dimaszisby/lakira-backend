# Register Rate Limiter — Checklist

## Phase 0 — Kit and branch

- [x] Branch `fix/register-rate-limiter` off `dev` at `4487a7f`, `--no-track`
- [x] Kit: `README.md`, plan, this checklist, `decisions.md` (D-01–D-03)

## Phase 1 — Code

- [x] `src/config/zodEnv.ts` — `RATE_LIMIT_REGISTER_IP_MAX`, positive integer, default 10
- [x] `src/shared/middleware/rate-limiter.ts` — `createRegisterIpRateLimiter` /
      `registerIpRateLimiter`
- [x] `src/features/shared/auth/infrastructure/http/router.ts` — limiter first on `POST /register`
- [x] `src/lib/openapi/openapi-docs.ts` — register 429; spec regenerated
- [x] `.env.example` — the new variable

## Phase 2 — Tests

- [x] `__tests__/unit/shared/middleware/rate-limiter.test.ts` — key, max, window, handler
- [x] `__tests__/unit/shared/middleware/register-rate-limiter.trip.test.ts` — real limiter trips on
      request 3; a second IP is unaffected
- [x] `__tests__/unit/features/auth/infrastructure/http/router.test.ts` — register chain order
- [x] env-schema test — skipped: no `RATE_LIMIT_*` variable has one; the trip test reads the
      value through the limiter instead
- [x] each new test shown failing before the change — the router test failed on the chain (no
      limiter); both limiter suites failed to compile (factory absent)

## Discovered

- [x] Found: `npx prettier --write src` reformatted 15 existing migrations and
      `src/config/config.cjs` → reverted with `git restore` before anything was staged; nothing
      from it is in this change

## Acceptance

- [x] AC-1 — trip test; router chain test
- [x] AC-2 — env schema
- [x] AC-3 — limiter unit test; no-op under `DISABLE_RATE_LIMITING`
- [x] AC-4 — OpenAPI check
- [x] AC-5 — docs and ADR-0053

## Gates

Final tree, Node 24.21.0, 2026-10-02.

- [x] typecheck — pass
- [x] lint — pass, 0 warnings
- [x] format — pass
- [x] tests — unit 666 pass (662 + 1 limiter + 2 trip + 1 router); integration 217 pass, 5 skipped
- [x] build — pass
- [x] OpenAPI — regenerated, valid; the diff is the register 429 only (10 lines); regeneration is
      byte-identical, so `docs:openapi:check` passes once the spec is committed (uncommitted it
      exits 1 by design)
- [x] security delta — skipped, no dependency change
- [x] extra: `contract:local:gate` — pass; seed 42, 42/47 selected, 1442 generated, the 2 known
      warnings
- [x] extra: manual run, `RATE_LIMIT_REGISTER_IP_MAX=2`, one client IP — 201 (remaining 1), 201
      (remaining 0), 429 with the documented body; `Registration IP rate limit hit` logged; two
      outbound emails for three requests; the test key was deleted from local Redis afterwards

## Docs

- [x] ADR-0053, registry row, next free moved to ADR-0054
- [x] `.claude/rules/security.md` § Rate Limiting
- [x] `docs/reference/configuration.md` row and trust-proxy note; `CLAUDE.md` env count (70 → 71,
      matching the schema) and its stale ADR count (45 → 53)
- [x] `2026-09-29-todo-register-rate-limiter.md` — fixed
- [x] `SAAS-BASE-CHECKLIST.md` § Top gaps item 5
- [x] `list-cache-key-filters/README.md` — merged in #126
- [ ] Notion Part 2 record, after merge (the frontend gains a documented 429 and a new local limit)
- [x] `docs/internal/todos/2026-10-02-todo-per-ip-limiter-hardening.md` — filed from review

## Review

`code-reviewer` pass: 0 critical, 2 warnings, 1 suggestion; nothing blocking.

- IPv6 /64 rotation gets a fresh budget per address — confirmed (express-rate-limit 7.5.1 has no
  `ipKeyGenerator`); shared by all six per-IP limiters, so recorded in ADR-0053 § Consequences and
  filed as `2026-10-02-todo-per-ip-limiter-hardening.md` rather than fixed for one limiter here.
- `req.ip` is correct only when `TRUST_PROXY` matches the real hop count — not verifiable from the
  repo; recorded in ADR-0053, `configuration.md`, and the same todo.
- Per-email limiting against bombing one victim — not needed: `RegisterUser.ts:46` answers 409 for
  an existing address before sending, so one address gets at most one registration email. Recorded
  as a rejected option in ADR-0053.
- Confirmed by the reviewer: the limiter runs before anything that can send mail; Redis keys
  (`rl:register-ip:*`) cannot collide with the other limiters; the trip test's mocked env is safe.
