export interface CachePort {
  isEnabled(): boolean;
  invalidate(
    userId: string,
    organizationId: string,
    metricId: string,
    logId?: string,
  ): Promise<void>;
}
