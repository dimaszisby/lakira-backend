# ADR-0062 — A relative analytics range ends with the current bucket, in the requested zone

- **Status:** Accepted (2026-10-13)
- **Date:** 2026-10-13
- **Related:** [ADR-0052](./adr-0052-ordered-queries-are-total.md) (log queries report by
  `loggedAt`); [ADR-0035](./adr-0035-tenant-scoped-cache-keys.md) (the range is part of the cache
  key)
- **Origin:** `D-01`, `D-02` and `D-03` in the analytics-relative-range kit —
  [`analytics-relative-range`](../../internal/initiatives/analytics-relative-range/decisions.md);
  register row B-02
  ([analysis](../../internal/initiatives/backend-debt-register/analysis-analytics-relative-range.md))

---

## Context

`GET /analytics/dashboard` and `GET /analytics/metrics/:metricId` take either an absolute range or
a relative one, `last=7d`. The frontend reported three things on 2026-10-07 and 2026-10-08.

1. **A relative range left out today.** The end was the present rounded **down** to the bucket, in
   UTC whatever `tz` was sent, and both queries take `logged_at < :end`. With `bucket=1d` a value
   logged today did not appear until tomorrow, and in Jakarta "tomorrow" began at 07:00 local
   time. The rounding had been added so that requests inside one bucket share a cache key and an
   ETag. Nothing documented "complete buckets only", and the fallback path below returned today's
   logs when they were the only ones, so the two paths disagreed.
2. **`firstLogAt` and `lastLogAt` were local times sent with a `Z`.** They were `MIN` and `MAX` of
   `timezone(:tz, logged_at)`. A log stored at `16:37:00Z` came back as `23:37:00.000Z` with
   `tz=Asia/Jakarta`. Inside a repeated daylight-saving hour two instants share a local time, so
   `MAX` could name the earlier one.
3. **The fallback range left out the log it was built from.** When the requested range holds
   nothing, the dashboard shows a window ending at the newest log. It ended **at** that log, and
   the query is half-open.

The start of a relative range was computed with `setDate` and `setMonth` on a `Date`, so it also
depended on the zone the server process ran in.

The owner confirmed on 2026-10-13 that the last seven days include today.

## Decision

1. **A relative range ends at the start of the bucket after the current one, in the requested
   zone, and starts the window's length before that end in the same zone's calendar.** For
   `last=7d&bucket=1d&tz=Asia/Jakarta` the end is the coming local midnight and the start is seven
   local days before it: seven local days, today being the seventh and partial. The same rule
   holds for every bucket size. Weeks start on Monday, as `date_trunc('week')` does. A month or a
   year back from a day the target month lacks lands on that month's last day.
2. **`firstLogAt` and `lastLogAt` are the stored instants,** `MIN(logged_at)` and
   `MAX(logged_at)`. `bucketStartISO` and `latestBucketStart` are unchanged: they label a bucket
   in the requested zone.
3. **The fallback range ends at the end of the bucket that holds the newest log,** by the same
   rule as (1) with that log in place of the present.

The arithmetic is `src/features/public/analytics/domain/relative-range.ts`, a pure module that is
given the present as an argument.

## Options considered

- **End a relative range at the present instant.** Rejected: the cache key and the ETag would
  change on every request, which is what the rounding was added to prevent.
- **End at the start of the next bucket in UTC.** Rejected: with `tz=Asia/Jakarta` the day would
  still turn over at 07:00 local time.
- **The requested zone for daily and coarser buckets, UTC for hourly.** Rejected: the SQL
  truncates hours in the requested zone too, so a second rule would be wrong for the half-hour
  zones and save nothing.
- **Call "complete buckets only" the design and document it.** Rejected by the owner.
- **End the fallback one millisecond after the newest log.** Rejected: the series is generated up
  to one second before the end, so a log in the first second of a bucket was counted by nothing.
  A test against the database showed it before the code was written.
- **Convert the bucket labels to instants as well.** Not done: the frontend plots them as they
  are, and it would move every chart's axis.
- **A date library.** Not added: two functions did not justify a dependency.

## Consequences

- **Observable API change, no type change.** A relative range includes the current bucket.
  `meta.range.endISO`, and `requestedRange.endISO` on a dashboard item, lie in the future for a
  relative range. `firstLogAt` and `lastLogAt` move by the zone's offset. A fallback's
  `actualRange.endISO` is a bucket edge, not the log's own time. The OpenAPI description of `last`
  says where the range ends.
- **The number of buckets in a relative range does not change.** The window moved forward by one
  bucket; it did not grow.
- **The range no longer depends on the server process's zone.** The unit suite passes with `TZ`
  set to `America/New_York` and to `Asia/Jakarta`.
- **Caching holds.** Every instant inside one bucket computes one range, so the cache key and the
  ETag are stable for the bucket. Keys for relative ranges differ from those written before this
  change, so no older entry is served for one. A dashboard response cached under an absolute
  range keeps its old `firstLogAt` and `lastLogAt` until its TTL expires.
- **A day in which a zone changes its offset is 23 or 25 hours long and is still one bucket.** A
  local time that happens twice resolves to the first; one that never happens resolves to the
  instant the clocks moved.
- **The zone arithmetic is ours to maintain,** daylight-saving changes included.

## Enforcement

- `__tests__/unit/features/analytics/domain/relative-range.test.ts` — the range for both sides of
  00:00 UTC in two zones, both New York offset changes, a half-hour zone, every bucket size, a
  skipped and a repeated local time on each side of UTC.
- `__tests__/unit/features/analytics/domain/fallback-range.test.ts` — the fallback's end.
- `__tests__/integration/api/analytics-caching.test.ts` › "a relative range" — a log made now is
  returned by both routes with the same stats and range, and a relative request answers 304 to
  its own ETag.
- `__tests__/integration/features/analytics/VisualizationReadRepoSequelize.integration.test.ts` —
  the stored instants in another zone and inside a repeated hour; a metric's only log through the
  fallback, including one made in the first second of a day.

## Links

- Kit: `docs/internal/initiatives/analytics-relative-range/`
