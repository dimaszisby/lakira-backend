import type { VisualizationInvalidationPort } from "@/shared/application/ports/VisualizationInvalidationPort.js";
import { invalidateCacheByPattern, redisClient } from "@/utils/redis-client.js";

export class AnalyticsVisualizationInvalidationAdapter implements VisualizationInvalidationPort {
  async invalidateByMetric(
    userId: string,
    organizationId: string,
    metricId: string,
  ): Promise<void> {
    if (!redisClient.isOpen) return;

    // The shared walk deletes a page of keys per round trip; this adapter's own
    // loop deleted one key per round trip, and ran its walks one after another
    // (#240, ADR-0087).
    await Promise.all([
      invalidateCacheByPattern(`viz:${organizationId}:${userId}:${metricId}:*`),
      invalidateCacheByPattern(`vizdash:${organizationId}:${userId}:*`),
    ]);
  }
}
