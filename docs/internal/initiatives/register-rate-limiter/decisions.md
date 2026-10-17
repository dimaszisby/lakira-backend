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

## D-06 — A limiter keyed by user runs after `authMiddleware`

- **Status:** Accepted (merged in #179, `8af8465`)
- **Date:** 2026-10-17

**Context.** Register row B-23, audit finding R10 (`audit-2026-09-29.md`); branch
`fix/user-limiter-after-auth`. `userRateLimiter` and `switchOrgRateLimiter` key on `req.user?.id`
and fall back to the client's address. `authMiddleware` is what sets `req.user`, and on eight
routes the limiter ran first: all six organization, invite and membership routes, which R10 names,
and `PUT /auth/profile` and `POST /auth/switch-org`, found in the same pass. Every authenticated
request on them was counted by IP, so users behind one address shared a budget and one user on two
networks had two.
**Decision.** On a route that runs `authMiddleware`, a limiter keyed by user
(`userRateLimiter`, `switchOrgRateLimiter`, `analyticsRateLimiter`) comes after it, in the route's
own chain. `architecture.test.ts` fails on a router call that names one ahead of
`authMiddleware`. Routes without `authMiddleware` (`/login`, `/logout`, `/refresh`) keep their
limiter and are counted by IP, as intended.
**Options considered.** `router.use(authMiddleware)`, as the metric routers do: rejected here,
since these routers also mount `methodNotAllowed`, and a 405 would become a 401. Keep an IP
limiter ahead of auth as well: rejected; no metric route has one, and the global limiter already
counts unauthenticated requests by IP.
**Consequences.** A request with no token or a bad one gets its 401 from `authMiddleware` without
being counted by these limiters; only the global limiter (100 per 15 min per IP) counts it, as on
every metric route. A 401 on these routes carries the global limiter's `RateLimit-*` headers
only.

## D-07 — Each limiter counts in its own Redis namespace

- **Status:** Accepted (merged in #179, `8af8465`)
- **Date:** 2026-10-17

**Context.** Found while checking D-06 end to end, on branch `fix/user-limiter-after-auth`; not
in any audit or the register. Every limiter's `RedisStore` used the library's default prefix,
`rl:`. The global limiter keys on `clientIpKey(req.ip)`, and the user, analytics and switch-org
limiters fall back to the same `clientIpKey(req.ip)` when there is no user. So they counted one
key, `rl:<ip>`, seen in local Redis as `rl:127.0.0.1`. After D-06 the fallback still runs on
`/login`, `/logout` and `/refresh`, which have no `authMiddleware`: each request there adds two to
the shared count, and the user limit (50) is read against a count the global limiter (100) also
writes. Once an address has sent 50 requests of any kind in 15 minutes, logging in and refreshing
are refused. Behind a shared proxy (B-05) that is every user at once. The in-memory store, used in
tests and when Redis is optional and down, gives each limiter its own store, which is why no test
saw it.
**Decision.** `maybeCreateStore(name)` takes the limiter's name and gives its store the prefix
`rl:<name>:`. The nine limiters pass nine distinct names. A unit test builds all nine with Redis
open and fails on a missing or repeated prefix. The keys themselves are unchanged.
**Options considered.** Prefix the IP fallback keys only (`user-ip:`, and so on): rejected, since
it fixes the three keys known today and leaves the next limiter free to collide; a prefix per store
holds for any key. Drop the namespaces some keys already carry (`register-ip:`), now redundant:
rejected as churn; they are harmless.
**Consequences.** Every Redis key a limiter writes changes name, so each counter starts from zero
once, on the deploy that ships this. The old keys expire within their window (an hour at most).
