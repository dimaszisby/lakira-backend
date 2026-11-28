/**
 * Clears the metric feature's caches, its list and a metric's detail (#314). A metric's list
 * item carries its settings' goal type, and its detail can include the settings, so a settings
 * write that left them cached served the old value until the TTL. The metric feature's
 * `MetricCacheRedis` satisfies it, wired in `src/composition/` (ADR-0023).
 */
export interface MetricCacheInvalidationPort {
  invalidateMetrics(
    userId: string,
    organizationId: string,
    metricId: string,
  ): Promise<void>;
}
