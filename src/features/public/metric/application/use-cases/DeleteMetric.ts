import { MetricRepository } from "../../domain/repositories/MetricRepository.js";
import { CachePort } from "../ports/CachePort.js";

type Input = {
  userId: string;
  organizationId: string;
  metricId: string;
};

export class DeleteMetric {
  constructor(
    private repo: MetricRepository,
    private cache: CachePort,
  ) {}

  async execute({ userId, organizationId, metricId }: Input) {
    const metric = await this.repo.findOwnedById(
      userId,
      organizationId,
      metricId,
    );

    if (this.cache.isEnabled() && metric.id) {
      await this.cache.invalidateMetrics(userId, organizationId, metric.id);
    }

    await this.repo.delete(organizationId, metric);

    return metric;
  }
}
