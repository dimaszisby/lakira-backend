import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import { parseIsoToDate } from "@/utils/date-io.js";
import { MetricLogRepository } from "../../domain/repositories/MetricLogRepository.js";
import { MetricLog } from "../../domain/entities/MetricLog.js";
import { CachePort } from "../ports/CachePort.js";

type Input = {
  userId: string;
  organizationId: string;
  logId: string;
  updates: Partial<{
    logValue: number;
    type: "manual" | "automatic";
    loggedAt: string | Date;
  }>;
};

export class UpdateMetricLog {
  constructor(
    private repo: MetricLogRepository,
    private cache: CachePort,
  ) {}

  async execute({
    userId,
    organizationId,
    logId,
    updates,
  }: Input): Promise<MetricLog> {
    const log = await this.repo.findById(userId, organizationId, logId);
    if (!log) throw new NotFoundError("Log not found");

    if (typeof updates.logValue !== "undefined") {
      try {
        log.setLogValue(updates.logValue);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid log value";
        throw new ValidationError(message);
      }
    }
    if (typeof updates.type !== "undefined") {
      log.setType(updates.type);
    }
    if (typeof updates.loggedAt !== "undefined") {
      const timestamp =
        updates.loggedAt instanceof Date
          ? updates.loggedAt
          : (parseIsoToDate(updates.loggedAt) as Date);
      if (Number.isNaN(timestamp.getTime())) {
        throw new ValidationError("loggedAt is invalid");
      }
      if (
        await this.repo.existsAtTimestamp(
          organizationId,
          log.metricId,
          timestamp,
          log.id,
        )
      ) {
        throw new ConflictError(
          "A log entry already exists for this timestamp for this metric",
        );
      }
      log.setLoggedAt(timestamp);
    }

    const saved = await this.repo.save(organizationId, log);
    if (this.cache.isEnabled()) {
      await this.cache.invalidate(
        userId,
        organizationId,
        saved.metricId,
        saved.id,
      );
    }
    return saved;
  }
}
