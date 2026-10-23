# Decisions — analytics-leftovers

## D-01 — The spec describes the dashboard response as it is sent

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** The controller sends the repository's response whole. The spec's dashboard item
lists 9 of its 18 fields, leaving out `lastLogAt`, `firstLogAt`, `totalLogs`, `latestValue`,
`latestBucketStart`, `requestedRange`, `actualRange`, `fallbackRangeUsed` and `fallbackStrategy`.
Its `meta` leaves out `totalMetrics` and `fallbackMetrics`, and the response's `sync.etagSeed` is
not in it at all.
**Decision.** Every field sent is documented, with the nullability the repository gives it.
`requestedRange` and `actualRange` share one range schema whose `bucket` is the bucket enum.
`fallbackStrategy` is `last_activity_window` or null. `sync.etagSeed` is described as what it is:
a hash of the cache key, not the response's `ETag`. `bucketStartISO` and `latestBucketStart` say
what ADR-0062 decided they are: a bucket's start in the requested zone, written as if it were UTC.
Found while making the change: the single-metric response's `metricId` and `meta.fill` were
missing too, and are documented; and the generator left `null` out of `fallbackStrategy`'s enum,
which a 3.1 reader then refuses, so the enum is given in full.
**Options considered.** _Drop `sync` from the response:_ a change the frontend would have to agree
to, not a correction of the spec. _Rename the `category_\*` fields:\_ B-87, waiting on the owner.
**Consequences.** The frontend's generated item type gains the nine fields it already receives. A
reader is unaffected, so there is no Notion record.

---

## D-02 — A fallback keeps the requested bucket

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `computeFallbackRange` coarsens the bucket while its estimate exceeds
`VIZ_FALLBACK_GUARD_BUCKETS`, and the item reports the coarser bucket in `actualRange.bucket`.
`fetchFallbackSeries` queries with the requested one. The coarsening is also dead: the function's
last step clamps the window to `guard × the requested bucket` unconditionally, and a window that
long holds at most `guard + 1` requested buckets. With `1h` over 30 days and a guard of 48, the
item reported `1d` for 48 hourly points.
**Decision.** The coarsening loop and the clamp after it are removed. The window ends where it
did, is at most `guard × the requested bucket` long, and reports the requested bucket, the one
queried. `FallbackComputation` loses `bucketSpec`, `bucketAlias` and `coarsenedBucket`, which only
tests read.
**Options considered.** _Query with the coarsened bucket:_ a `1h` request would get three daily
points where it gets 48 hourly ones today, and the guard holds either way.
**Consequences.** No series changes. `actualRange.bucket` changes only where it named a bucket
that was never queried.

---

## D-03 — Bucket labels do not depend on the server process's zone

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `bucket_start` and `latest_bucket_start` are `timestamp without time zone`, the
bucket's wall time in the requested zone. The driver reads one in the process's zone. ADR-0062
decision 2 keeps them as that wall time written with a `Z`, which holds only on a UTC process:
with the process in `Asia/Jakarta`, the bucket for 2025-06-10 in `tz=UTC` came back as
`2025-06-09T17:00:00.000Z`. `latestBucketStart` was also sent as the driver's value, not through
`isoFrom` as the other two timestamps are.
**Decision.** The SQL selects `timezone('UTC', …)` of each, a `timestamptz` that reads, in UTC,
as the bucket's wall time. The driver reads that the same in every zone, and `toISOString` gives
what a UTC process gives today. `latestBucketStart` goes through `isoFrom`.
**Options considered.** _Format them with `to_char`:_ a format string in four places, for what the
driver already does. _Send real instants:_ rejected by ADR-0062, as it moves every chart's axis.
_Parse every `timestamp` as UTC in the driver:_ changes every such column the app reads, not these.
**Consequences.** Nothing changes on a UTC process, which production is. A process in any other
zone sends the same labels.
