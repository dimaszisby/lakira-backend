# Todo — per-IP rate limiters: IPv6 subnets and the trusted hop count

- **Status:** Open (P3)
- **Created:** 2026-10-02
- **Owner:** unassigned
- **Origin:** review of kit `register-rate-limiter`; recorded in ADR-0053 § Consequences

---

## What

Two weaknesses shared by every per-IP limiter in `src/shared/middleware/rate-limiter.ts` (global,
user and analytics fallbacks, switch-org fallback, password-reset IP, email-verification IP,
register IP):

1. **IPv6 is keyed per address.** A client with an IPv6 /64 can rotate source addresses and get a
   fresh budget each time. The installed `express-rate-limit` is 7.5.1, which has neither the
   `ipKeyGenerator` helper nor the IPv6 key-generator validation that later majors add, so nothing
   warns.
2. **`req.ip` depends on `TRUST_PROXY`** (`src/server.ts`, default 1 hop). With two proxies in
   front, every client shares the edge's address; with the value set higher than the real hop
   count, `X-Forwarded-For` is client-controlled. The hop count of staging and production is not
   recorded anywhere in the repo, and `.env.example` leaves `TRUST_PROXY` commented out.

## Suggested fix

- Mask IPv6 to /64 in one shared key helper used by every per-IP limiter — either an upgrade to an
  `express-rate-limit` major that exports `ipKeyGenerator` (a dependency change: security delta
  gate, release notes) or a small local helper.
- Record each environment's proxy topology and its `TRUST_PROXY` value in
  `docs/reference/configuration.md` once the ADR-0042 VPS layout is settled, and add a startup log
  line printing the effective trust-proxy setting.
