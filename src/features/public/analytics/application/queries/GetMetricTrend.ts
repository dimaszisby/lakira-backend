import {
  UnauthorizedError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import type { MetricAccessPort } from "../ports/MetricAccessPort.js";
import type { TrendRepository, TrendPoint } from "../ports/TrendRepository.js";

type GetMetricTrendInput = {
  userId: string;
  organizationId: string;
  metricId: string;
  days?: number;
};

export { TrendPoint as MetricTrendPoint };

export class GetMetricTrend {
  constructor(
    private metricAccess: MetricAccessPort,
    private trendRepo: TrendRepository,
  ) {}

  async execute({
    userId,
    organizationId,
    metricId,
    days = 30,
  }: GetMetricTrendInput): Promise<TrendPoint[]> {
    if (!userId) throw new UnauthorizedError("User not authenticated");
    if (!metricId) throw new ValidationError("Metric ID is required");

    await this.metricAccess.ensureMetricOwnership(
      userId,
      organizationId,
      metricId,
    );

    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.trendRepo.findTrendPoints({
      metricId,
      organizationId,
      since,
    });
  }
}
