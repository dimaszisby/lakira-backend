import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import { cursorCacheNamespace } from "@/shared/cache/keys.js";
import { MetricLogCacheRedis } from "@/features/metric-log/infrastructure/cache/MetricLogCacheRedis.js";
import type { VisualizationInvalidationPort } from "@/shared/application/ports/VisualizationInvalidationPort.js";

const invalidateByMetricMock: jest.MockedFunction<
  VisualizationInvalidationPort["invalidateByMetric"]
> = jest.fn(async () => {});
const vizInvalidator: VisualizationInvalidationPort = {
  invalidateByMetric: invalidateByMetricMock,
};

jest.mock("@/utils/redis-client.js", () => ({
  redisClient: {
    isOpen: true,
  },
  invalidateCache: jest.fn(),
  invalidateCacheByPattern: jest.fn(),
}));

const { redisClient, invalidateCache, invalidateCacheByPattern } =
  jest.requireMock("@/utils/redis-client.js") as {
    redisClient: { isOpen: boolean };
    invalidateCache: jest.MockedFunction<(key: string) => Promise<void>>;
    invalidateCacheByPattern: jest.MockedFunction<
      (pattern: string) => Promise<void>
    >;
  };

jest.mock("@/shared/cache/logging.js", () => ({
  logCacheInvalidation: jest.fn(),
  logCacheInvalidationError: jest.fn(),
}));

const { logCacheInvalidation, logCacheInvalidationError } = jest.requireMock(
  "@/shared/cache/logging.js",
) as {
  logCacheInvalidation: jest.Mock;
  logCacheInvalidationError: jest.Mock;
};

const ALL_CURSOR_NS = cursorCacheNamespace("metric-logs", "*");

describe("MetricLogCacheRedis", () => {
  const cache = new MetricLogCacheRedis(vizInvalidator);

  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.isOpen = true;
    invalidateCache.mockResolvedValue(undefined);
    invalidateCacheByPattern.mockResolvedValue(undefined);
  });

  it("short-circuits when redis is closed", async () => {
    redisClient.isOpen = false;

    await cache.invalidate("user-1", "org-1", "metric-2");

    expect(invalidateCacheByPattern).not.toHaveBeenCalled();
    expect(vizInvalidator.invalidateByMetric).not.toHaveBeenCalled();
  });

  it("invalidates all metric log scopes and linked visualizations", async () => {
    await cache.invalidate("user-1", "org-1", "metric-2", "log-3");

    expect(invalidateCacheByPattern).toHaveBeenCalledWith(
      `${ALL_CURSOR_NS}:user-1:org:org-1:*fm:metric-2*`,
    );
    expect(invalidateCacheByPattern).toHaveBeenCalledWith(
      `${ALL_CURSOR_NS}:user-1:org:org-1:*`,
    );
    expect(invalidateCache).toHaveBeenCalledWith(
      "logStats:org-1:user-1:metric-2",
    );
    expect(invalidateCache).toHaveBeenCalledWith("logStats:org-1:user-1:all");
    // The single-log key names the metric it was read under, so every metric's
    // entry for the log goes (query-values-mean-what-they-say D-05).
    expect(invalidateCacheByPattern).toHaveBeenCalledWith(
      "log:org-1:user-1:log-3:*",
    );
    expect(vizInvalidator.invalidateByMetric).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "metric-2",
    );
    expect(logCacheInvalidation).toHaveBeenCalledWith("metric-log-cache", {
      userId: "user-1",
      organizationId: "org-1",
      metricId: "metric-2",
      logId: "log-3",
    });
  });

  it("omits logId invalidation when not provided", async () => {
    await cache.invalidate("user-9", "org-9", "metric-7");

    expect(invalidateCache).toHaveBeenCalledWith(
      "logStats:org-9:user-9:metric-7",
    );
    expect(invalidateCache).toHaveBeenCalledWith("logStats:org-9:user-9:all");
    expect(invalidateCache).not.toHaveBeenCalledWith(
      "log:org-9:user-9:metric-7",
    );
    expect(invalidateCacheByPattern).not.toHaveBeenCalledWith(
      expect.stringMatching(/^log:/),
    );
    expect(logCacheInvalidation).toHaveBeenCalledWith("metric-log-cache", {
      userId: "user-9",
      organizationId: "org-9",
      metricId: "metric-7",
      logId: "-",
    });
  });

  it("logs and rethrows when invalidation fails", async () => {
    const err = new Error("redis down");
    invalidateCacheByPattern.mockRejectedValueOnce(err);

    await expect(
      cache.invalidate("user-a", "org-a", "metric-b"),
    ).rejects.toThrow(err);
    expect(logCacheInvalidationError).toHaveBeenCalledWith(
      "metric-log-cache",
      err,
      {
        userId: "user-a",
        organizationId: "org-a",
        metricId: "metric-b",
        logId: "-",
      },
    );
  });
});
