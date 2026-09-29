import AppError from "@/utils/AppError.js";
import { parseIsoToDate } from "@/utils/date-io.js";
import { MetricLogRepository } from "../../domain/repositories/MetricLogRepository.js";
import { MetricLog } from "../../domain/entities/MetricLog.js";
import type { MetricAccessPort } from "../ports/MetricAccessPort.js";
import { CachePort } from "../ports/CachePort.js";

type Input = {
  userId: string;
  organizationId: string;
  metricId: string;
  logValue: number;
  type?: "manual" | "automatic";
  loggedAt?: string | Date;
};

export class CreateMetricLog {
  constructor(
    private repo: MetricLogRepository,
    private metricAccess: MetricAccessPort,
    private cache: CachePort,
  ) {}

  async execute(input: Input): Promise<MetricLog> {
    const { userId, organizationId, metricId } = input;
    if (!metricId) throw new AppError("metricId is required", 400);

    await this.metricAccess.ensureMetricOwnership(
      userId,
      organizationId,
      metricId,
    );

    const timestamp =
      input.loggedAt instanceof Date
        ? input.loggedAt
        : input.loggedAt
          ? (parseIsoToDate(input.loggedAt) as Date)
          : new Date();

    if (Number.isNaN(timestamp.getTime())) {
      throw new AppError("loggedAt is invalid", 400);
    }

    if (
      await this.repo.existsAtTimestamp(organizationId, metricId, timestamp)
    ) {
      throw new AppError(
        "A log entry already exists for this timestamp for this metric",
        409,
      );
    }

    const log = await this.repo.create({
      metricId,
      organizationId: input.organizationId,
      logValue: input.logValue,
      type: input.type ?? "manual",
      loggedAt: timestamp,
    });

    if (this.cache.isEnabled()) {
      await this.cache.invalidate(userId, organizationId, metricId, log.id);
    }

    return log;
  }
}
