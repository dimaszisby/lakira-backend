/**
 * What this feature needs from the metric feature's cache: to clear a metric's
 * list pages and its own entry, which carry its logs and their count (#251).
 *
 * Owned here, not imported from the metric feature (ADR-0023). The metric
 * feature's MetricCacheRedis satisfies it, and src/composition/ passes it in,
 * as it does MetricAccessPort (metric-access-wiring D-01).
 */
export interface MetricCacheInvalidationPort {
  invalidateMetrics(
    userId: string,
    organizationId: string,
    metricId: string,
  ): Promise<void>;
}
