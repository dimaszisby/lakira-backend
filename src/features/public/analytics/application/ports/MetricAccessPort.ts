/**
 * What this feature needs from metrics: proof that the caller may act on one.
 *
 * Owned here, not imported from the metric feature (ADR-0023): each consumer states its own
 * contract. The metric feature's MetricAccessSequelize, from its public.ts, satisfies it.
 */
export interface MetricAccessPort {
  ensureMetricOwnership(
    userId: string,
    organizationId: string,
    metricId: string,
  ): Promise<void>;
}
