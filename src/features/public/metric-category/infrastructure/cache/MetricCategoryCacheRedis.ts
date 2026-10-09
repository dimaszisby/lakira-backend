import { CachePort } from "../../application/ports/CachePort.js";
import { redisClient, invalidateCacheByPattern } from "@/utils/redis-client.js";
import {
  logCacheInvalidation,
  logCacheInvalidationError,
} from "@/shared/cache/logging.js";
import { readCachedJson } from "@/shared/cache/read.js";

export class MetricCategoryCacheRedis implements CachePort {
  constructor(private defaultTtlSeconds = 300) {}

  isEnabled(): boolean {
    return redisClient.isOpen;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isEnabled()) return null;
    const value = await redisClient.get(key);
    if (!value) return null;
    const cached = readCachedJson(value, key);
    return cached.ok ? (cached.value as T) : null;
  }

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    if (!this.isEnabled()) return;
    await redisClient.setEx(
      key,
      ttlSec ?? this.defaultTtlSeconds,
      JSON.stringify(value),
    );
  }

  async delete(key: string): Promise<void> {
    if (!this.isEnabled()) return;
    await redisClient.del(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await invalidateCacheByPattern(pattern);
      logCacheInvalidation("metric-category-cache", { pattern });
    } catch (error) {
      logCacheInvalidationError("metric-category-cache", error, { pattern });
      throw error;
    }
  }
}
