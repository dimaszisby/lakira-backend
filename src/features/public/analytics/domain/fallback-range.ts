import { resolveBucket, type BucketAlias, type BucketSpec } from "./buckets.js";
import { startOfNextBucket } from "./relative-range.js";

const DEFAULT_HORIZON_MS = 1000 * 60 * 60 * 24 * 180; // 180 days

export type RangeDescriptor = {
  startISO: string;
  endISO: string;
  bucket: BucketAlias;
};

export type FallbackComputation = {
  range: RangeDescriptor;
  estimatedBuckets: number;
  strategy: "last_activity_window";
};

export type FallbackInput = {
  requested: RangeDescriptor;
  lastLogAt: string | Date | null;
  tz: string;
  guardBuckets: number;
  maxHorizonMs?: number;
};

export function computeFallbackRange({
  requested,
  lastLogAt,
  tz,
  guardBuckets,
  maxHorizonMs = DEFAULT_HORIZON_MS,
}: FallbackInput): FallbackComputation | null {
  const spec = resolveBucket(requested.bucket);
  const last = normalizeDate(lastLogAt);
  if (!last) return null;

  // The end of the bucket the newest log is in, as a relative range ends with the
  // current bucket. Ending at the log itself left it out: the query is half-open,
  // and its series stops a second short of the end (ADR-0062).
  const fallbackEnd = startOfNextBucket(last, requested.bucket, tz);
  // At most the guard's number of requested buckets, so the series is queried, and
  // reported, at the requested bucket (analytics-leftovers D-02).
  const span = Math.min(
    maxHorizonMs,
    Math.max(requestedDurationMs(requested), spec.approxMs),
    guardBuckets * spec.approxMs,
  );
  const fallbackStart = new Date(fallbackEnd.getTime() - span);

  return {
    range: {
      startISO: fallbackStart.toISOString(),
      endISO: fallbackEnd.toISOString(),
      bucket: requested.bucket,
    },
    estimatedBuckets: estimateBuckets(fallbackStart, fallbackEnd, spec),
    strategy: "last_activity_window",
  };
}

function estimateBuckets(start: Date, end: Date, spec: BucketSpec) {
  const span = Math.max(end.getTime() - start.getTime(), 0);
  return Math.ceil(span / spec.approxMs) + 1;
}

function requestedDurationMs(range: RangeDescriptor) {
  const start = Date.parse(range.startISO);
  const end = Date.parse(range.endISO);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return DEFAULT_HORIZON_MS;
  }
  return end - start;
}

function normalizeDate(value: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
}
