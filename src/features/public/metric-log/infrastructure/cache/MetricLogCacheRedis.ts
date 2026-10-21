import { invalidateCacheByPattern, redisClient } from "@/utils/redis-client.js";
import { CachePort } from "../../application/ports/CachePort.js";
import type { VisualizationInvalidationPort } from "@/shared/application/ports/VisualizationInvalidationPort.js";
import { cursorCacheNamespace } from "@/shared/cache/keys.js";
import {
  logCacheInvalidation,
  logCacheInvalidationError,
} from "@/shared/cache/logging.js";

const METRIC_LOG_CURSOR_NAMESPACE_ALL = cursorCacheNamespace(
  "metric-logs",
  "*",
);

export class MetricLogCacheRedis implements CachePort {
  constructor(
    private visualizationInvalidation: VisualizationInvalidationPort,
  ) {}

  isEnabled(): boolean {
    return redisClient.isOpen;
  }

  async invalidate(
    userId: string,
    organizationId: string,
    metricId: string,
    logId?: string,
  ): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await invalidateCacheByPattern(
        `${METRIC_LOG_CURSOR_NAMESPACE_ALL}:${userId}:org:${organizationId}:*fm:${metricId}*`,
      );
      await invalidateCacheByPattern(
        `${METRIC_LOG_CURSOR_NAMESPACE_ALL}:${userId}:org:${organizationId}:*`,
      );

      // Every cached range of the metric and of "all" (metric-log-stats-in-sql D-03).
      await invalidateCacheByPattern(
        `logStats:${organizationId}:${userId}:m:${metricId}:*`,
      );
      await invalidateCacheByPattern(
        `logStats:${organizationId}:${userId}:m:all:*`,
      );

      await this.visualizationInvalidation.invalidateByMetric(
        userId,
        organizationId,
        metricId,
      );

      if (logId) {
        // Every metric's entry for the log: the key names the metric it was read
        // under (query-values-mean-what-they-say D-05).
        await invalidateCacheByPattern(
          `log:${organizationId}:${userId}:${logId}:*`,
        );
      }

      logCacheInvalidation("metric-log-cache", {
        userId,
        organizationId,
        metricId,
        logId: logId ?? "-",
      });
    } catch (error) {
      logCacheInvalidationError("metric-log-cache", error, {
        userId,
        organizationId,
        metricId,
        logId: logId ?? "-",
      });
      throw error;
    }
  }
}
