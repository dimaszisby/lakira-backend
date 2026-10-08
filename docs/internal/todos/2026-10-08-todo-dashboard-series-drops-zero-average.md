# Todo — a dashboard series point with a real average of zero is returned as null

- **Status:** Open (P3). Read in the code, not reproduced
- **Created:** 2026-10-08
- **Owner:** unassigned
- **Origin:** seen while fixing the dashboard stats; kit
  [`deterministic-query-ordering`](../initiatives/deterministic-query-ordering/decisions.md) D-05

---

## What

`buildDashboardItem` in
`src/features/public/analytics/infrastructure/persistence/VisualizationReadRepoSequelize.ts` maps
each bucket to a series point. With `fill=none` the value is `Number(row.avg_value ?? 0) || null`,
so a bucket whose logs average exactly 0 becomes `null`, the same as a bucket with no logs.

The single-metric path in the same file uses `r.avg_value ?? null` and keeps the zero, so the two
endpoints can disagree on one bucket. The `stats` of both are not affected: they come from
`summarizeBuckets`, which keeps a zero average.

## Why it is not part of the stats fix

The request that fix answers is about `stats`. This changes a value in `series`, which the
frontend draws, and whether a metric can hold a log of 0 at all has not been checked.

## Suggested fix

Decide by the bucket's count and not by the truth of its average: `null` when the bucket is empty,
the average otherwise. Check first whether `zPositiveFloat` lets a log value of 0 through, because
if it cannot, nothing reaches this. Add a case to the integration test that forces it.
