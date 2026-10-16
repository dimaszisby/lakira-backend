# ADR-0063 — A per-IP rate limiter keys an IPv6 client by its /64

- **Status:** Accepted (merged in #173, `71af760`)
- **Date:** 2026-10-16
- **Related:** [ADR-0053](./adr-0053-registration-rate-limited-per-ip.md) (registration is limited
  per IP; its Consequences named this gap); [ADR-0057](./adr-0057-rate-limiters-answer-through-the-error-envelope.md)
  (how a limiter answers)
- **Origin:** `D-04` in the register-rate-limiter kit —
  [`register-rate-limiter`](../../internal/initiatives/register-rate-limiter/decisions.md);
  register row B-18
  ([todo](../../internal/todos/2026-10-02-todo-per-ip-limiter-hardening.md))

---

## Context

Nine keys in `src/shared/middleware/rate-limiter.ts` read the client's address:

- the global limiter, which sets no key of its own and so took the library's default, `req.ip`;
- five limiters that fall back to the address when there is no user or email: user, analytics,
  switch-org, password-reset email and email-verification email;
- three that are per-IP by design: password reset, email verification and registration.

Each used the address whole. An IPv6 client is normally given a /64, which holds 2^64 addresses,
so it could send each request from a new one and get a fresh budget every time. Registration's
limit of 10 an hour meant nothing to such a client. The installed `express-rate-limit` (7.5.1)
has no IPv6 subnet helper and does not warn about this.

The server listens dual-stack (`app.listen(PORT)` with no host). With no proxy in front, an IPv4
client's `req.ip` is written `::ffff:203.0.113.9`. The first 64 bits of that are zero, so masking
it as IPv6 would have put every IPv4 client in one bucket.

## Decision

Every key that reads the address passes it through `clientIpKey` in `rate-limiter.ts`:

- **No address:** `anonymous`, as before.
- **IPv4:** unchanged. No IPv4 key changes.
- **IPv4-mapped IPv6** (`::ffff:a.b.c.d`, in either spelling): the dotted IPv4 address.
- **Any other IPv6 address:** its first 64 bits, written as four groups in lower case with no
  leading zeros, followed by `::/64`. For example, `2001:db8:0:1::/64`. Every spelling of an
  address in one /64 gives one key. A zone id is ignored.

The global limiter gets a `keyGenerator` that calls the helper. Log lines keep the full `req.ip`:
an operator reading a 429 needs the address that was sent.

The prefix is a constant, 64, not a setting.

## Options considered

- **Upgrading to `express-rate-limit` 8, which exports `ipKeyGenerator`.** Rejected. It is a major
  upgrade across nine limiters, with `rate-limit-redis` compatibility to prove, the security delta
  gate and an image rebuild. That is a dependency taken on for about thirty lines of code.
- **A /56 prefix, version 8's default.** Rejected. It closes more of the gap: a client given a /56
  has 256 /64s. But a mobile carrier gives each subscriber a /64 from a shared pool, so a /56 would
  merge up to 256 subscribers into one budget. At 10 registrations an hour, that merge falls on
  real users.
- **A configurable prefix.** Rejected: a seventieth variable with no environment that needs a
  different value.

## Consequences

- **A client that rotates addresses inside one /64 now gets one budget.**
- **Clients sharing a /64 share a budget,** as clients behind one NAT already share one IPv4
  address.
- **A client holding a /56 or a /48 still has 2^8 or 2^16 budgets.** That is accepted. Narrowing
  further would fall on mobile users first.
- **IPv6 counters reset once on deploy.** An IPv6 client's counters move to a new key, so it gets
  one fresh window, an hour at most. IPv4 keys are unchanged, so their counters carry over.
- **A value that is not a bare address is keyed as written,** for example a bracketed address
  with a port, or a list. Express gives a bare address from the socket or from a correctly trusted
  `X-Forwarded-For`, so such a value means the hop count is wrong, which is the point below.
- **This does not settle which address `req.ip` is.** That is decided by `TRUST_PROXY` and the
  proxy chain in front of each environment, which is still register row B-18's second half,
  together with B-05.

## Enforcement

- `__tests__/unit/shared/middleware/rate-limiter.test.ts` › `clientIpKey` covers each shape above,
  and each limiter with an address path is checked with an IPv6 request.
- `__tests__/unit/shared/middleware/register-rate-limiter.trip.test.ts` drives the real limiter:
  two addresses in one /64 share a budget, and one in the next /64 does not.
- `__tests__/unit/architecture.test.ts` fails when a `rateLimit({` call in `rate-limiter.ts` sets
  no `keyGenerator`, or when a key generator reads `req.ip` without `clientIpKey`.

## Links

- Todo: `docs/internal/todos/2026-10-02-todo-per-ip-limiter-hardening.md` (item 1)
- Kit log: `docs/internal/initiatives/register-rate-limiter/decisions.md` D-04
