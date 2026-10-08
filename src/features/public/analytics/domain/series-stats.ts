import type { VizStats } from "./types.js";

type Numeric = number | string | null | undefined;

// One bucket of a visualization series, as the SQL returns it. An empty
// bucket has null figures and a null count.
export type BucketAggregate = {
  avg_value: Numeric;
  min_value: Numeric;
  max_value: Numeric;
  cnt: Numeric;
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
    const cnt = finite(row.cnt);
    const avg = finite(row.avg_value);
    if (cnt == null || cnt <= 0 || avg == null) continue;

    count += cnt;
    weightedSum += avg * cnt;

    const rowMin = finite(row.min_value);
    if (rowMin != null) min = min == null ? rowMin : Math.min(min, rowMin);
    const rowMax = finite(row.max_value);
    if (rowMax != null) max = max == null ? rowMax : Math.max(max, rowMax);
  }

  return {
    average: count > 0 ? weightedSum / count : null,
    min,
    max,
    count,
  };
}
