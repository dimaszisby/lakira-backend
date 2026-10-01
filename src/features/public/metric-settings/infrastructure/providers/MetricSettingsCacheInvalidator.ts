import {
  invalidateCache,
  invalidateCacheByPattern,
  redisClient,
} from "@/utils/redis-client.js";
import { CacheInvalidationPort } from "../../application/ports/CacheInvalidationPort.js";
import { cursorCacheNamespace } from "@/shared/cache/keys.js";
import { METRIC_SETTINGS_CURSOR_FEATURE } from "../../application/cache.constants.js";
import {
  logCacheInvalidation,
  logCacheInvalidationError,
} from "@/shared/cache/logging.js";

const METRIC_SETTINGS_CURSOR_NAMESPACE_ALL = cursorCacheNamespace(
  METRIC_SETTINGS_CURSOR_FEATURE,
  "*",
);

export class MetricSettingsCacheInvalidator implements CacheInvalidationPort {
  async invalidate(
    userId: string,
    organizationId: string,
    metricId?: string,
    settingsId?: string,
  ): Promise<void> {
    if (!redisClient.isOpen) return;
    try {
      // The list cache (kit list-cache-key-filters, D-05). This used to clear
      // `metricSettings:<org>:<user>:*`, a key format nothing writes, so the
      // list served pre-write pages for up to its 300 s TTL.
      await invalidateCacheByPattern(
        `${METRIC_SETTINGS_CURSOR_NAMESPACE_ALL}:${userId}:org:${organizationId}:*`,
      );

      if (settingsId) {
        await invalidateCache(
          `metricSetting:${organizationId}:${userId}:${settingsId}`,
        );
      }

      logCacheInvalidation("metric-settings-cache", {
        userId,
        organizationId,
        metricId: metricId ?? "-",
        settingsId: settingsId ?? "-",
      });
    } catch (error) {
      logCacheInvalidationError("metric-settings-cache", error, {
        userId,
        organizationId,
        metricId: metricId ?? "-",
        settingsId: settingsId ?? "-",
      });
      throw error;
    }
  }
}
