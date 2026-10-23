/** One day of a metric's trend. */
export type MetricTrendPoint = {
  date: Date;
  value: number;
};

/**
 * The query `GET /metrics/:metricId/trends` answers with. Analytics provides it, and
 * `src/app.ts` hands it to the metric router; metric names no analytics type
 * (architecture-boundaries D-01).
 */
export interface MetricTrendPort {
  execute(input: {
    userId: string;
    organizationId: string;
    metricId: string;
  }): Promise<MetricTrendPoint[]>;
}
