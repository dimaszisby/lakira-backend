import { invalidateCacheByPattern, redisClient } from "@/utils/redis-client.js";
import { CachePort } from "../../application/ports/CachePort.js";
import { cursorCacheNamespace } from "@/shared/cache/keys.js";
import {
  METRIC_CURSOR_FEATURE,
  metricEntryPattern,
} from "../../application/cache.constants.js";
import {
  logCacheInvalidation,
  logCacheInvalidationError,
} from "@/shared/cache/logging.js";

const METRIC_CURSOR_NAMESPACE_ALL = cursorCacheNamespace(
  METRIC_CURSOR_FEATURE,
  "*",
);

export class MetricCacheRedis implements CachePort {
  isEnabled(): boolean {
    return redisClient.isOpen;
  }

  async invalidateMetrics(
    userId: string,
    organizationId: string,
    metricId?: string,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      // Started together: each walk steps through the whole keyspace (ADR-0087).
      await Promise.all([
        invalidateCacheByPattern(
          `${METRIC_CURSOR_NAMESPACE_ALL}:${userId}:org:${organizationId}:*`,
        ),
        ...(metricId
          ? [
              invalidateCacheByPattern(
                metricEntryPattern(organizationId, userId, metricId),
              ),
            ]
          : []),
      ]);
      logCacheInvalidation("metric-cache", {
        userId,
        organizationId,
        metricId: metricId ?? "-",
      });
    } catch (error) {
      logCacheInvalidationError("metric-cache", error, {
        userId,
        organizationId,
        metricId: metricId ?? "-",
      });
    }
  }
}
