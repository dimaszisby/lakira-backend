# Todo — `POST /auth/register` has no per-route rate limiter

- **Status:** Fixed in kit [`register-rate-limiter`](../initiatives/register-rate-limiter/README.md)
  (ADR-0053); closes on merge. R1 stays open in the audit until a dated run confirms it (ADR-002)
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
