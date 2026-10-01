# ADR-0053 — Registration is rate-limited per client IP, per hour

- **Status:** Accepted
- **Date:** 2026-10-02
- **Related:** audit finding R1 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6);
  `.claude/rules/security.md` § Rate Limiting; `docs/reference/configuration.md` § Rate limiting
- **Origin:** `D-01` and `D-02` in the register-rate-limiter kit —
  [`register-rate-limiter`](../../internal/initiatives/register-rate-limiter/decisions.md)

---

## Context

`POST /auth/register` is unauthenticated, and every successful registration emails the address it
was given. Until this change only the app-wide limiter applied — 100 requests per 15 minutes per
IP — so one client could make the service send verification mail to roughly 400 addresses of its
choosing an hour, which is both a cost and a sender-reputation problem.

The two other unauthenticated routes that send mail already had a dedicated per-IP limiter with a
one-hour window, first in their middleware chain: password reset and email verification
(`src/shared/middleware/rate-limiter.ts`).

## Decision

1. **`POST /auth/register` gets its own limiter, keyed by client IP** (`register-ip:<ip>`), with a
   **one-hour window**, mounted **first** in the route's chain — before body parsing and
   validation, so a request over the limit is never parsed, validated or turned into an email, and
   malformed requests spend budget too.
2. **Its budget is `RATE_LIMIT_REGISTER_IP_MAX`**, a positive integer defaulting to `10`, validated
   at startup like every other limit. It is a variable of its own, not shared with the
   verification-email limit.

It uses the shared Redis store outside tests, becomes a no-op under `DISABLE_RATE_LIMITING=true`
(refused in production by ADR-0036), and answers with the same 429 body as every other limiter.

## Options considered

- **Key on the submitted email.** Rejected: the attacker chooses the address, so a per-email key
  does not slow a flood of new ones. It is also not needed to protect a single victim:
  `RegisterUser` answers 409 for an address that already has an account before anything is sent
  (`src/features/shared/auth/application/use-cases/RegisterUser.ts:46`), so one address receives at
  most one registration email however many clients try.
- **Reuse `userRateLimiter`.** Rejected: with no user it falls back to the IP with a 15-minute
  window of 50 — too loose for a route that sends mail.
- **Share `RATE_LIMIT_EMAIL_VERIFICATION_IP_MAX`.** Rejected: registering and re-sending a
  verification email are different budgets; coupling them means raising one raises the other.
- **Skip failed requests** (`skipFailedRequests`). Rejected: failed attempts are part of the abuse
  pattern and cost the service work.
- **CAPTCHA or a global registration cap.** Deferred: neither is needed to close R1, and both
  change the client contract.

## Consequences

- **A legitimate burst from one IP can hit the limit** — an office behind NAT onboarding more than
  ten people in an hour, or a local or E2E test run that registers many users. The deployment
  raises `RATE_LIMIT_REGISTER_IP_MAX` (local development usually runs with
  `DISABLE_RATE_LIMITING=true`).
- **The key is only as good as `req.ip`.** `src/server.ts` sets `trust proxy` to `TRUST_PROXY`,
  default 1 hop. That is right with exactly one proxy in front. With two (a CDN in front of the
  platform proxy) every client shares the edge's address and one budget; with `TRUST_PROXY` set
  higher than the real hop count, `X-Forwarded-For` becomes client-controlled and the limit can be
  bypassed. Each environment's hop count must match its topology. This holds for every per-IP
  limiter, not only this one.
- **IPv6 addresses are keyed whole.** A client holding an IPv6 /64 can rotate addresses and get a
  fresh budget for each. The installed `express-rate-limit` (7.5.1) has no IPv6 subnet helper.
  Shared by all per-IP limiters; tracked in
  `docs/internal/todos/2026-10-02-todo-per-ip-limiter-hardening.md`.
- **The 429 body is the current rate-limit shape** (`{status: 429, message}`), documented on the
  route in OpenAPI. When `error-envelope-residuals` Phase 2 moves the limiters onto the error
  envelope, this one moves with them.

## Links

- Kit: `docs/internal/initiatives/register-rate-limiter/`
- Limiter: `createRegisterIpRateLimiter` in `src/shared/middleware/rate-limiter.ts`
- Variable: `RATE_LIMIT_REGISTER_IP_MAX` in `src/config/zodEnv.ts`
