import { NotFoundError } from "@/shared/domain/errors/DomainError.js";
import { MetricLogRepository } from "../../domain/repositories/MetricLogRepository.js";
import { MetricLog } from "../../domain/entities/MetricLog.js";

type Input = {
  userId: string;
  organizationId: string;
  logId: string;
};

export class GetMetricLog {
  constructor(private repo: MetricLogRepository) {}

  async execute({ userId, organizationId, logId }: Input): Promise<MetricLog> {
    const log = await this.repo.findById(userId, organizationId, logId);
    if (!log) throw new NotFoundError("Log not found");
    return log;
  }
}
