export type MetricLogStatsCriteria = {
  organizationId: string;
  metricId?: string;
  userId?: string;
  /** Logs with `from <= loggedAt < to`; either bound may be open (ADR-0079). */
  from?: Date;
  to?: Date;
};

export type MetricLogStats = {
  average: number;
  min: number;
  max: number;
};

export interface MetricLogStatsPort {
  computeStats(criteria: MetricLogStatsCriteria): Promise<MetricLogStats>;
}
