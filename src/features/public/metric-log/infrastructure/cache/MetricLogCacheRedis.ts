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
      const patterns = [
        // Every list page of the user's logs, whatever metric it filtered by.
        `${METRIC_LOG_CURSOR_NAMESPACE_ALL}:${userId}:org:${organizationId}:*`,
        // Every cached range of the metric and of "all" (metric-log-stats-in-sql D-03).
        `logStats:${organizationId}:${userId}:m:${metricId}:*`,
        `logStats:${organizationId}:${userId}:m:all:*`,
      ];
      if (logId) {
        // Every metric's entry for the log: the key names the metric it was read
        // under (query-values-mean-what-they-say D-05).
        patterns.push(`log:${organizationId}:${userId}:${logId}:*`);
      }

      // Each walk steps through the whole keyspace, so they start together
      // rather than one after another (#240, ADR-0087).
      await Promise.all([
        ...patterns.map((pattern) => invalidateCacheByPattern(pattern)),
        this.visualizationInvalidation.invalidateByMetric(
          userId,
          organizationId,
          metricId,
        ),
      ]);

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
