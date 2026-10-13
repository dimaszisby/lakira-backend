import { resolveBucket, type BucketAlias, type BucketSpec } from "./buckets.js";
import { startOfNextBucket } from "./relative-range.js";

const DEFAULT_HORIZON_MS = 1000 * 60 * 60 * 24 * 180; // 180 days
const ORDERED_BUCKETS: BucketAlias[] = ["1h", "1d", "1w", "1m", "1y"];

export type RangeDescriptor = {
  startISO: string;
  endISO: string;
  bucket: BucketAlias;
};

export type FallbackComputation = {
  range: RangeDescriptor;
  bucketSpec: BucketSpec;
  bucketAlias: BucketAlias;
  estimatedBuckets: number;
  strategy: "last_activity_window";
  coarsenedBucket: boolean;
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
  const requestedSpec = resolveBucket(requested.bucket);
  const guardSpanMs = guardBuckets * requestedSpec.approxMs;
  const last = normalizeDate(lastLogAt);
  if (!last) return null;

  const requestedSpan = requestedDurationMs(requested);
  let bucketAlias: BucketAlias = requested.bucket;
  let spec = resolveBucket(bucketAlias);
  const baseSpan = Math.min(
    maxHorizonMs,
    Math.max(requestedSpan, spec.approxMs),
  );
  // The end of the bucket the newest log is in, as a relative range ends with the
  // current bucket. Ending at the log itself left it out: the query is half-open,
  // and its series stops a second short of the end (ADR-0062).
  const fallbackEnd = startOfNextBucket(last, requested.bucket, tz);
  let fallbackStart = new Date(fallbackEnd.getTime() - baseSpan);
  let estimatedBuckets = estimateBuckets(fallbackStart, fallbackEnd, spec);
  let coarsenedBucket = false;

  while (estimatedBuckets > guardBuckets) {
    const next = nextBucket(bucketAlias);
    if (!next) break;
    bucketAlias = next;
    spec = resolveBucket(bucketAlias);
    estimatedBuckets = estimateBuckets(fallbackStart, fallbackEnd, spec);
    coarsenedBucket = true;
  }

  if (estimatedBuckets > guardBuckets) {
    const maxSpan = guardBuckets * spec.approxMs;
    fallbackStart = new Date(
      Math.max(fallbackEnd.getTime() - maxSpan, fallbackStart.getTime()),
    );
    estimatedBuckets = estimateBuckets(fallbackStart, fallbackEnd, spec);
  }

  const actualSpan = fallbackEnd.getTime() - fallbackStart.getTime();
  if (actualSpan > guardSpanMs) {
    fallbackStart = new Date(fallbackEnd.getTime() - guardSpanMs);
    estimatedBuckets = estimateBuckets(fallbackStart, fallbackEnd, spec);
  }

  return {
    range: {
      startISO: fallbackStart.toISOString(),
      endISO: fallbackEnd.toISOString(),
      bucket: bucketAlias,
    },
    bucketSpec: spec,
    bucketAlias,
    estimatedBuckets,
    strategy: "last_activity_window",
    coarsenedBucket,
  };
}

function nextBucket(current: BucketAlias): BucketAlias | null {
  const idx = ORDERED_BUCKETS.indexOf(current);
  if (idx === -1 || idx === ORDERED_BUCKETS.length - 1) return null;
  return ORDERED_BUCKETS[idx + 1];
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
