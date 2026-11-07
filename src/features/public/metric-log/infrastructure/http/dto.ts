import { MetricLogDomain } from "@/types/domain/metric-log.domain.js";

export interface MetricLogResponseDTO {
  readonly id: string;
  readonly metricId: string;
  readonly type: "manual" | "automatic";
  readonly logValue: number;
  readonly loggedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const toMetricLogResponseDTO = (
  domain: MetricLogDomain,
): MetricLogResponseDTO => ({
  id: domain.id,
  metricId: domain.metricId,
  type: domain.type,
  logValue: domain.logValue,
  loggedAt: domain.loggedAt.toISOString(),
  createdAt: domain.createdAt.toISOString(),
  updatedAt: domain.updatedAt.toISOString(),
});

export const toMetricLogListResponseDTO = (
  logs: MetricLogDomain[],
): MetricLogResponseDTO[] => logs.map(toMetricLogResponseDTO);
