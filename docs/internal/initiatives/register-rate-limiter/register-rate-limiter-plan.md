# Register Rate Limiter — Plan

- **Status:** Approved
- **Appetite:** 1 day — past that, cut scope rather than extend
- **Date:** 2026-10-02

## Context and goals

`src/features/shared/auth/infrastructure/http/router.ts` mounts `POST /register` with only the
global limiter (100 requests per 15 minutes per IP). Every registration emails the submitted
address, so one IP can make the service send mail to roughly 400 arbitrary recipients an hour.

The two other email-sending routes already have an IP-keyed hourly limiter first in their chain —
`passwordResetIpRateLimiter` and `emailVerificationIpRateLimiter` in
`src/shared/middleware/rate-limiter.ts`, each with its own `RATE_LIMIT_*_IP_MAX` variable. This
gives registration the same. `trust proxy` defaults to one hop (`src/server.ts`), so behind the
platform proxy `req.ip` is the client and the limit is per client.

## Acceptance criteria

- **AC-1** — From one IP, the `RATE_LIMIT_REGISTER_IP_MAX + 1`-th `POST /auth/register` within an
  hour gets 429, and the rejected request reaches neither validation nor the controller, so it
  sends no email. _Why:_ R1.
- **AC-2** — `RATE_LIMIT_REGISTER_IP_MAX` is a positive integer, default `10`, rejected at startup
  if invalid. _Why:_ every limiter in the repo is configured this way.
- **AC-3** — The limiter is IP-keyed (`register-ip:<ip>`), uses the shared Redis store outside
  tests, and is a no-op under `DISABLE_RATE_LIMITING=true`. _Why:_ consistency with the other
  per-IP limiters; contract tests and fuzzing must keep working.
- **AC-4** — OpenAPI documents the 429 on `POST /auth/register`, and the spec validates. _Why:_ a
  response the route can send belongs in the contract.
- **AC-5** — `.claude/rules/security.md`, `docs/reference/configuration.md` and `.env.example` list
  the limiter and its variable; ADR-0053 records the decision. _Why:_ the rule must outlive the
  change.

## Open questions

None.

## Out of scope

- A per-email or global registration limit; CAPTCHA.
- The 429 body shape — `error-envelope-residuals` Phase 2 moves every limiter onto the envelope.
- Other routes whose 429 is undocumented.

## Decisions expected

- Key, window, default and position (D-01); a dedicated variable (D-02); the 429 body (D-03).
  D-01 and D-02 are promoted to ADR-0053.

## Phases

### Phase 1 — Code

- `src/config/zodEnv.ts`: `RATE_LIMIT_REGISTER_IP_MAX`.
- `src/shared/middleware/rate-limiter.ts`: `createRegisterIpRateLimiter` / `registerIpRateLimiter`.
- Auth router: the limiter first on `POST /register`.
- `src/lib/openapi/openapi-docs.ts`: the register 429; spec regenerated.
- `.env.example`: the new variable.

### Phase 2 — Tests

- The existing limiter unit harness: key, max, window, handler.
- A trip test with the real `express-rate-limit` on a mini app — integration tests run with
  `DISABLE_RATE_LIMITING=true` and `env` is read at import, so the shared app cannot exercise it.
- An auth router test pinning the register chain order.

## Risks and trade-offs

- A legitimate burst from one shared IP (an office behind NAT) can hit the limit. The limit is
  configurable without a code change.
- Local and E2E frontend runs that register many users against one backend need the limit raised
  there. The frontend is told through the shared handoff page.

## Rollback

Code: revert-safe — no migration, no data. Raising `RATE_LIMIT_REGISTER_IP_MAX` disables the limit
in practice without a deploy of code.

## Security and data

Adds a control on an unauthenticated route that sends email. Keys hold the client IP only, in the
same store and with the same retention (one window) as the existing per-IP limiters.

## References

- `docs/internal/todos/2026-09-29-todo-register-rate-limiter.md`
- `docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6 R1
