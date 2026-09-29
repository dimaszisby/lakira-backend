import type { MetricAccessPort } from "../ports/MetricAccessPort.js";
import type {
  MetricLogStatsPort,
  MetricLogStats,
} from "../ports/MetricLogStatsPort.js";

type Input = {
  userId: string;
  organizationId: string;
  metricId?: string;
};

export class GetMetricLogStats {
  constructor(
    private access: MetricAccessPort,
    private statsRepo: MetricLogStatsPort,
  ) {}

  async execute({
    userId,
    organizationId,
    metricId,
  }: Input): Promise<MetricLogStats> {
    if (metricId) {
      await this.access.ensureMetricOwnership(userId, organizationId, metricId);
    }

    return this.statsRepo.computeStats({ organizationId, metricId, userId });
  }
}
