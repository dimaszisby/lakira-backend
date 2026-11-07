export interface CachePort {
  isEnabled(): boolean;
  invalidateMetrics(
    userId: string,
    organizationId: string,
    metricId?: string,
  ): Promise<void>;
}
