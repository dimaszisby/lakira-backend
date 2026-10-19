import { ForbiddenError } from "@/shared/domain/errors/DomainError.js";
import type {
  IncludeKey,
  MetricDetailQuery,
  MetricReadRepository,
} from "../ports/MetricReadRepository.js";
import type { MetricDomainExtended } from "../../domain/metric.domain.js";

type Input = MetricDetailQuery;

export class GetMetricDetail {
  constructor(private repo: MetricReadRepository) {}

  async execute({
    userId,
    organizationId,
    metricId,
    includes = [],
    logsLimit = 20,
  }: Input): Promise<MetricDomainExtended | null> {
    const metric = await this.repo.findDetailedMetric({
      userId,
      organizationId,
      metricId,
      includes,
      logsLimit,
    });

    if (!metric) return null;
    if (!metric.isPublic && metric.userId !== userId) {
      throw new ForbiddenError("Unauthorized");
    }

    return metric;
  }
}

export type { IncludeKey };
