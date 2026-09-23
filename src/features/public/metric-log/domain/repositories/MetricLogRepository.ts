import { MetricLog } from "../entities/MetricLog.js";
import type { PersistenceTransaction } from "@/shared/application/ports/MessageIdempotencyPort.js";

export type CreateMetricLogDTO = {
  metricId: string;
  organizationId: string;
  logValue: number;
  type: "manual" | "automatic";
  loggedAt: Date;
};

export interface MetricLogRepository {
  existsAtTimestamp(
    organizationId: string,
    metricId: string,
    loggedAt: Date,
    excludeLogId?: string,
  ): Promise<boolean>;
  create(
    data: CreateMetricLogDTO,
    tx?: PersistenceTransaction,
  ): Promise<MetricLog>;
  findById(
    userId: string,
    organizationId: string,
    logId: string,
  ): Promise<MetricLog | null>;
  save(organizationId: string, log: MetricLog): Promise<MetricLog>;
  delete(organizationId: string, log: MetricLog): Promise<void>;
}
