import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import type { FillMode } from "../../domain/types.js";
import {
  resolveBucket,
  BucketAlias,
  type BucketSpec,
} from "../../domain/buckets.js";
import type {
  VisualizationReadRepository,
  DashboardVizResponse,
} from "../ports/VisualizationReadRepository.js";

export type GetDashboardVisualizationInput = {
  userId: string;
  organizationId: string;
  startISO: string;
  endISO: string;
  bucket: BucketAlias;
  tz: string;
  fill?: FillMode;
  limit?: number;
};

/**
 * Handed in by `buildAnalyticsFeature` from `VIZ_MAX_BUCKETS` and
 * `VIZ_DASH_MAX_METRICS` (v6-small-items D-04).
 */
export type GetDashboardVisualizationLimits = {
  maxBuckets: number;
  maxDashboardMetrics: number;
};

export class GetDashboardVisualization {
  constructor(
    private repo: VisualizationReadRepository,
    private limits: GetDashboardVisualizationLimits,
  ) {}

  async execute(
    input: GetDashboardVisualizationInput,
  ): Promise<DashboardVizResponse> {
    const spec = resolveBucket(input.bucket);
    assertBounds(input.startISO, input.endISO, spec, this.limits.maxBuckets);

    const limit = Math.min(input.limit ?? 12, this.limits.maxDashboardMetrics);

    return this.repo.fetchDashboardVisualization({
      userId: input.userId,
      organizationId: input.organizationId,
      startISO: input.startISO,
      endISO: input.endISO,
      bucket: input.bucket,
      bucketSpec: spec,
      tz: input.tz,
      fill: input.fill ?? "none",
      limit,
    });
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
