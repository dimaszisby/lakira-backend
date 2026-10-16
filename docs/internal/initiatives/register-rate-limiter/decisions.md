# Register Rate Limiter — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Registration is limited per IP, per hour, first in the chain

- **Status:** Accepted
- **Date:** 2026-10-02

Promoted to the architecture decision registry as **[ADR-0053](../../../explanation/decisions/adr-0053-registration-rate-limited-per-ip.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — A dedicated variable, `RATE_LIMIT_REGISTER_IP_MAX`

- **Status:** Accepted
- **Date:** 2026-10-02

Promoted to the architecture decision registry as **[ADR-0053](../../../explanation/decisions/adr-0053-registration-rate-limited-per-ip.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — The new 429 uses the current rate-limit body

- **Status:** Accepted
- **Date:** 2026-10-02

**Context.** Every limiter answers `{status: 429, message}`, outside the error envelope; moving them
onto the envelope is `error-envelope-residuals` Phase 2, waiting on the frontend.
**Decision.** This limiter uses the same handler shape and body, documented with
`RateLimitErrorSchema` as `/auth/forgot-password` does.
**Options considered.** Give this one the envelope now: rejected, it would leave two 429 shapes in
the API, worse than one consistent exception.
**Consequences.** Phase 2 moves it with the rest.

## D-04 — A per-IP limiter keys an IPv6 client by its /64

- **Status:** Accepted (merged in #173, `71af760`)
- **Date:** 2026-10-16

Promoted to the architecture decision registry as **[ADR-0063](../../../explanation/decisions/adr-0063-a-per-ip-limiter-keys-an-ipv6-client-by-its-64.md)**.
That file is authoritative; this entry is a pointer. Register row B-18, its IPv6 half; branch
`fix/limiter-ipv6-subnet`, #173.

## D-05 — `TRUST_PROXY` must be a whole number of hops, and startup prints it

- **Status:** Accepted (merged in #174, `702a418`)
- **Date:** 2026-10-16

**Context.** Register row B-18, its second half; branch `fix/trust-proxy-startup-check`. Every
per-IP limiter keys on `req.ip`, which Express derives from `trust proxy`. `src/config/zodEnv.ts`
read `TRUST_PROXY` as `z.coerce.number().optional()`, which turns an empty or blank value into `0`
and accepts `-1` and `1.5`. A blank value, as a variable left empty in a platform dashboard
leaves it, trusts no proxy, so every client shares the edge's address and one budget. `1.5`
trusts two hops, so one hop of `X-Forwarded-For` is written by the client. Nothing logged the
value in use.
**Decision.** `TRUST_PROXY` is a whole number, 0 or more, defaulting to 1 in the schema. An
empty or blank value, a negative and a fraction are refused at startup with the variable's name;
surrounding spaces are trimmed first, as coercion did, so no value that worked stops working. It
stays a hop count, never a subnet or `true`. Once the server listens it logs
`[SERVER] Trusting proxy hops` with `trustProxyHops`, read back from Express.
**Options considered.** Treat an empty value as unset: rejected. That would move a blank value
from trusting 0 hops to trusting 1, and on a host with no proxy in front 1 makes
`X-Forwarded-For` the client's to write; a refusal changes nothing silently. Log `req.ip` on every
access line, which would show what the limiters see: rejected here, since it adds an address to
every line; it belongs with B-05's decision. An ADR: not written, since no valid value changes
behaviour; a value that already mis-configured the boundary is refused, the pattern ADR-0036 set.
**Consequences.** A deploy whose `TRUST_PROXY` is blank, negative or fractional stops starting.
Each environment's real hop count is still not recorded; that moves to register row B-05.
