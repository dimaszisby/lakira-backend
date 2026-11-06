# ADR-0087 — Cache pattern deletes walk together, in pages of 1000

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** issue #240 (finding N9 of the 2026-06-05 run, register row B-95); issue #251, whose
  fix adds patterns to a log write; the follow-up issue "Replace cache pattern deletes with
  tracked key sets", filed with this record
- **Origin:** issue #240, measured and decided on 2026-11-06

---

## Context

The cache is cleared by pattern: `invalidateCacheByPattern` walks the keyspace with `SCAN` and
deletes what matches. `SCAN` steps through every key in Redis whatever `MATCH` says: every
tenant's cache and every limiter counter. A walk therefore costs (all keys / page size) round
trips, however few keys match.

N9 asked whether that walk, on the client the rate limiters share, slows them. On 2026-11-06
`scripts/measure-redis-pattern-delete.ts` ran the real `MetricLogCacheRedis.invalidate` against
Redis 7 at three keyspace sizes. A round trip took about 1.5 ms there.

- **The limiters were not slowed.** Their p99 rose 0.3 ms during a walk. node-redis pipelines the
  one connection, so a limiter command waits behind one page, not a whole walk.
- **The writing request was.** A log create, update or delete awaited 7 walks one after another:
  5 through `invalidateCacheByPattern` with pages of 100, and 2 through the visualization adapter's
  own loop, which deleted one key per round trip.
  - One of the 7, `...:*fm:<metricId>*`, only repeated part of `...:*`.
  - At 100k keys a write waited 16.4 s, and Redis spent 722 ms on it.

## Decision

- **Pages of 1000** (`SCAN_PAGE_SIZE` in `src/utils/redis-client.ts`), up from 100.
- **A caller with several patterns starts every walk at once** with `Promise.all`:
  `MetricLogCacheRedis`, `MetricCacheRedis` and `AnalyticsVisualizationInvalidationAdapter`.
- The visualization adapter goes through `invalidateCacheByPattern`, so it deletes a page per
  round trip and logs the way every other walk does.
- The repeated `...:*fm:<metricId>*` walk is gone.
- **The result**, measured the same way:

  | Keys in Redis | A log write waited | Redis was busy  |
  | ------------- | ------------------ | --------------- |
  | ~1k           | 309 ms → 11 ms     | 5.7 ms → 1.7 ms |
  | ~10k          | 1.8 s → 72 ms      | 66 ms → 18 ms   |
  | ~100k         | 16.4 s → 792 ms    | 722 ms → 270 ms |

  A limiter's p50 during a write rose from about 1.6 ms to 3.9 ms, and its p99 by 2.6 ms, under the
  5 ms the issue set beforehand.

- **The walk still grows with the keyspace.** It is under the issue's 100 ms threshold up to about
  10k keys and over it at 100k. Past that, tracked key sets replace pattern deletes: the follow-up
  issue, `state:deferred` until `DBSIZE` passes 10k or the script shows a write over 100 ms.

## Options considered

- **One walk with no `MATCH`, matching every pattern in Node:** a sixth of the server's `SCAN`
  work, but every key in Redis crosses the network on each write, about 10 MB at 100k keys.
- **A second Redis client for the limiters or for the walks:** the limiters were not the ones
  slowed.
- **Tracked key sets now:** cost independent of the keyspace, but they touch every cache write
  and need their sets' expiry handled. That is 1 to 2 days for a keyspace nobody has measured
  outside a test.
- **Invalidating after the response:** the writer's next read could be served the old entry.

## Consequences

- A log write's invalidation costs a few dozen round trips at today's sizes, not hundreds.
- Several walks at once put more pages ahead of a limiter command for the length of a write.
- The script stays, so a fix to the follow-up issue is measured the same way.
