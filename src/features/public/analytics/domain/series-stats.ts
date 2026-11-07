import type { VizStats } from "./types.js";

type Numeric = number | string | null | undefined;

// One bucket of a visualization series. An empty bucket has null figures and
// a null count. A figure may be a numeric string, as the driver returns some
// numeric columns; the repository maps its SQL row to this
// (v6-small-items D-05).
export type BucketAggregate = {
  average: Numeric;
  min: Numeric;
  max: Numeric;
  count: Numeric;
};

function finite(value: Numeric): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Stats for a whole series. The average is the mean of the logs: each
// bucket's average weighted by its count, so a day with one log does not
// weigh the same as a day with ten.
export function summarizeBuckets(rows: readonly BucketAggregate[]): VizStats {
  let count = 0;
  let weightedSum = 0;
  let min: number | null = null;
  let max: number | null = null;

  for (const row of rows) {
    const cnt = finite(row.count);
    const avg = finite(row.average);
    if (cnt == null || cnt <= 0 || avg == null) continue;

    count += cnt;
    weightedSum += avg * cnt;

    const rowMin = finite(row.min);
    if (rowMin != null) min = min == null ? rowMin : Math.min(min, rowMin);
    const rowMax = finite(row.max);
    if (rowMax != null) max = max == null ? rowMax : Math.max(max, rowMax);
  }

  return {
    average: count > 0 ? weightedSum / count : null,
    min,
    max,
    count,
  };
}
