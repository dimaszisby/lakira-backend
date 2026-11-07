# Todo — `JWT_SECRET` is accepted at any length

- **Status:** Fixed on `fix/jwt-secret-minimum-length` (kit `jwt-secret-minimum-length`, D-01; ADR-0036 amended). Confirmed closed by the dated run of 2026-10-20 ([`audit-2026-10-20.md`](../audits/saas-readiness/audit-2026-10-20.md) § 4.2, W2), reproduced (register row B-07)
- **Created:** 2026-10-12
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-12.md` § 6, W2 (security agent)

---

## What

`src/config/zodEnv.ts:31` validates `JWT_SECRET` as `min(1)`. Tokens are signed with HS256
(`src/utils/token-generator.ts:18`, `JwtTokenProvider.ts:12`), where the secret's strength is the
signature's. Reproduced: a production start with `JWT_SECRET=a` passes environment validation.

The template's placeholder, `replace-with-a-long-random-secret`, is also accepted, so a deployment
that copies `.env.example` and skips bootstrap signs tokens with a published string.

## Suggested fix

Require at least 32 characters, in production at the least, and refuse the template's placeholder
when `NODE_ENV=production`, beside the other ADR-0036 refusals. Check the test and CI
environments first: `.env.test.example` sets `replace-with-test-secret`.

## Related

An older open row: `verify()` pins no `algorithms`, `iss` or `aud`.
