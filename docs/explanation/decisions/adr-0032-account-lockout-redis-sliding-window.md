# ADR-0032 — Account lockout: Redis sliding window vs express-brute

- **Status:** Accepted
- **Date:** 2026-05-18
- **Origin:** `ADR-001` in the Production readiness kit — [`production-readiness`](../../internal/initiatives/production-readiness/decisions.md)

---

## Context

The audit flagged no per-account brute-force protection ([P1-4.4]). The existing rate limiters (global, user, analytics) are IP-based or user-ID-based via `express-rate-limit` + Redis. A per-email lockout is a different concern — it targets credential-stuffing attacks that stay under the per-IP limit by distributing across IPs.

## Decision

1. Use a lightweight Redis sliding-window counter (INCR + EXPIRE) rather than adding `express-brute` as a dependency.
2. Key: `auth:lockout:<sha256(email)>` — hash the email to avoid storing PII in Redis.

   > **2026-10-16:** the rule now covers the rate-limiter keys as well. The password-reset and
   > email-verification limiters key on `hashEmail` too
   > (`<prefix>:email:<sha256>`), and `__tests__/unit/architecture.test.ts` fails on a limiter key
   > that interpolates an address any other way
   > ([`log-redaction-coverage` D-15](../../internal/initiatives/log-redaction-coverage/decisions.md);
   > register row B-19).

3. Threshold: 5 failures in 15 minutes → 429.
4. Reset on success (DEL key).
5. Graceful degradation: if Redis is unreachable, log a warning and allow the login attempt (don't block auth because the lockout store is down).

**Implementation:** `src/features/shared/auth/infrastructure/http/loginLockout.ts` — `checkLockout` / `recordFailedAttempt` / `resetLockout`, wired into the login controller. Unit coverage in `__tests__/unit/features/auth/infrastructure/http/loginLockout.test.ts`; integration coverage (gated by `ENABLE_REDIS_INTEGRATION`) in `__tests__/integration/api/auth-lockout.test.ts`.

## Options considered

- _`express-brute` package._ Rejected: last published 2019; adds a dependency for something achievable with 20 lines of Redis calls. The existing `ioredis` client already covers the need.
- _In-memory counter._ Rejected: doesn't survive process restarts; doesn't work across horizontally scaled instances.

## Consequences

- New Redis key namespace `auth:lockout:*`.
- Monitoring: the `auth.lockout.triggered` log event can feed alerting.
- If Redis is down, lockout silently disables — acceptable tradeoff since the IP-based rate limiter is still active.

## Links

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md` § 4.4
- `production-readiness-plan.md` § Phase C

---
