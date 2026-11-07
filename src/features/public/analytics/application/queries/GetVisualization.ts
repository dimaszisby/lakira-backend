import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import type { FillMode, VizResponse } from "../../domain/types.js";
import {
  resolveBucket,
  BucketAlias,
  type BucketSpec,
} from "../../domain/buckets.js";
import type { VisualizationReadRepository } from "../ports/VisualizationReadRepository.js";

export type GetVisualizationInput = {
  userId: string;
  organizationId: string;
  metricId: string;
  startISO: string;
  endISO: string;
  bucket: BucketAlias;
  tz: string;
  fill?: FillMode;
};

/** Handed in by `buildAnalyticsFeature` from `VIZ_MAX_BUCKETS` (v6-small-items D-04). */
export type GetVisualizationLimits = { maxBuckets: number };

export class GetVisualization {
  constructor(
    private repo: VisualizationReadRepository,
    private limits: GetVisualizationLimits,
  ) {}

  async execute(input: GetVisualizationInput): Promise<VizResponse> {
    const spec = resolveBucket(input.bucket);
    assertBounds(input.startISO, input.endISO, spec, this.limits.maxBuckets);

    const result = await this.repo.fetchVisualization({
      userId: input.userId,
      organizationId: input.organizationId,
      metricId: input.metricId,
      startISO: input.startISO,
      endISO: input.endISO,
      bucket: input.bucket,
      bucketSpec: spec,
      tz: input.tz,
      fill: input.fill ?? "none",
    });

    return result;
  }
}

function assertBounds(
  startISO: string,
  endISO: string,
  spec: BucketSpec,
  maxBuckets: number,
) {
  const start = Date.parse(startISO);
  const end = Date.parse(endISO);

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    throw new ValidationError("Invalid date range");
  }

  const est = Math.ceil((end - start) / spec.approxMs) + 2;
  if (est > maxBuckets) {
    throw new ValidationError(
      `Range too large for ${spec.iso} (~${est} buckets, max=${maxBuckets})`,
    );
  }
}
