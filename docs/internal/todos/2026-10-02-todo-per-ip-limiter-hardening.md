# Todo — per-IP rate limiters: IPv6 subnets and the trusted hop count

- **Status:** Open (P3)
- **Created:** 2026-10-02
- **Owner:** unassigned
- **Origin:** review of kit `register-rate-limiter`; recorded in ADR-0053 § Consequences

---

## What

Three weaknesses shared by every per-IP limiter in `src/shared/middleware/rate-limiter.ts` (global,
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

3. **The frontend proxy hides the browser's address.** lakira-frontend's
   `src/app/api/proxy/[...path]/route.ts` forwards the incoming headers but never sets
   `X-Forwarded-For` itself (no match in its `src` on frontend `dev` at `9e52eb6`). With one
   trusted hop, `req.ip` for proxied traffic is then the frontend server's address, so every user
   who reaches the API through `/api/proxy` shares one budget in each per-IP limiter: the app-wide
   100 per 15 minutes, password reset, email verification, and registration at 10 per hour.
   Inferred from code in both repos; the deployed proxy chain is not recorded anywhere, so this is
   unverified against a live environment. Raised with the frontend as a "Needs decision" record
   (Notion, "FE and BE messages", Part 2: "Client IP is lost through the frontend proxy"); no
   reply as of 2026-10-02.

## Suggested fix

- Mask IPv6 to /64 in one shared key helper used by every per-IP limiter — either an upgrade to an
  `express-rate-limit` major that exports `ipKeyGenerator` (a dependency change: security delta
  gate, release notes) or a small local helper.
- Record each environment's proxy topology and its `TRUST_PROXY` value in
  `docs/reference/configuration.md` once the ADR-0042 VPS layout is settled, and add a startup log
  line printing the effective trust-proxy setting.
- For the frontend proxy: wait for the frontend's choice between the options in the Notion record
  (the proxy sets `X-Forwarded-For` and the backend trusts the real hop count; a dedicated header
  guarded by a shared secret; or accepting the shared budget). The backend side of the first is
  `TRUST_PROXY` per environment plus a test.
