# Todo — one Redis client serves the cache, the limiters and the pattern deletes

- **Status:** Open. Issue #240 (was register row B-95)
- **Created:** 2026-10-27
- **Owner:** unassigned
- **Origin:** N9 (P2) of `docs/internal/audits/saas-readiness/audit-2026-06-05.md` § 6.3, re-read
  on 2026-10-27 ([`audit-0605-reread`](../initiatives/audit-0605-reread/README.md))

---

## What

`src/utils/redis-client.ts` creates one client for the process. The cache reads and writes, the
rate limiters' store and `invalidateCacheByPattern`, which walks the keyspace with `SCAN`, all go
through it.

## Why it matters

Each `SCAN` page is its own round trip, so other commands interleave rather than wait for a whole
walk; the run's "blocking" overstates it. What remains is that a long walk over a large keyspace
adds latency to every request's cache and limiter calls on the same connection, and that the
limiters, which every request passes, share fate with cache traffic.

## Suggested fix

Measure first: the number of keys a pattern delete walks in a realistic tenant, and the latency
it adds. If it matters, a second client for pattern deletes (or for the limiters), or replacing
pattern deletes with tracked key sets. Effort ≤1d, per the run.
