# Todo — `POST /auth/register` has no per-route rate limiter

- **Status:** Open (R1, P2)
- **Created:** 2026-09-29
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-09-29.md` §6 R1; kit `saas-gold-reaudit` D-04

---

## What

`src/features/shared/auth/infrastructure/http/router.ts:40-45` mounts `/register` with only the
global limiter (100 requests per 15 minutes per IP). `/login` has `userRateLimiter`. Every
registration emails the submitted address, so the route can send mail to arbitrary recipients.
Present since `dfb96d3` (2026-05-01).

## Suggested fix

An IP-keyed limiter ahead of `validate()` (there is no user yet), with its own env var in the
pattern of `RATE_LIMIT_*`, and an integration test that proves the limit trips.
