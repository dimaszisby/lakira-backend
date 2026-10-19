import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import { loadEnvOrExit } from "@/config/envManager.js";
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

export class GetDashboardVisualization {
  constructor(private repo: VisualizationReadRepository) {}

  async execute(
    input: GetDashboardVisualizationInput,
  ): Promise<DashboardVizResponse> {
    const env = loadEnvOrExit();
    const spec = resolveBucket(input.bucket);
    assertBounds(input.startISO, input.endISO, spec, env.VIZ_MAX_BUCKETS);

    const limit = Math.min(input.limit ?? 12, env.VIZ_DASH_MAX_METRICS);

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
