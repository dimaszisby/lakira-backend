export interface CacheInvalidationPort {
  invalidate(
    userId: string,
    organizationId: string,
    metricId?: string,
    settingsId?: string,
  ): Promise<void>;
}
