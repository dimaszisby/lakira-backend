import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import { MetricCacheRedis } from "@/features/metric/infrastructure/cache/MetricCacheRedis.js";

jest.mock("@/utils/redis-client.js", () => ({
  redisClient: {
    isOpen: true,
  },
  invalidateCacheByPattern: jest.fn(),
}));

const { redisClient, invalidateCacheByPattern } = jest.requireMock(
  "@/utils/redis-client.js",
) as {
  redisClient: { isOpen: boolean };
  invalidateCacheByPattern: jest.MockedFunction<(key: string) => Promise<void>>;
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

describe("MetricCacheRedis", () => {
  const cache = new MetricCacheRedis();

  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.isOpen = true;
    invalidateCacheByPattern.mockResolvedValue(undefined);
  });

  it("reflects redis availability via isEnabled", () => {
    redisClient.isOpen = true;
    expect(cache.isEnabled()).toBe(true);

    redisClient.isOpen = false;
    expect(cache.isEnabled()).toBe(false);
  });

  it("skips invalidation when redis is disabled", async () => {
    redisClient.isOpen = false;

    await cache.invalidateMetrics("user-1", "org-1", "metric-2");

    expect(invalidateCacheByPattern).not.toHaveBeenCalled();
    expect(logCacheInvalidation).not.toHaveBeenCalled();
  });

  it("invalidates metric user scopes and logs context", async () => {
    await cache.invalidateMetrics("user-9", "org-9", "metric-5");

    expect(invalidateCacheByPattern).toHaveBeenNthCalledWith(
      1,
      "cursor:metrics:v*:user-9:org:org-9:*",
    );
    expect(invalidateCacheByPattern).toHaveBeenNthCalledWith(
      2,
      "metric:org-9:user-9:metric-5:*",
    );
    expect(logCacheInvalidation).toHaveBeenCalledWith("metric-cache", {
      userId: "user-9",
      organizationId: "org-9",
      metricId: "metric-5",
    });
  });

  it("starts both walks before either finishes (#240)", async () => {
    let finish: () => void = () => {};
    invalidateCacheByPattern.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );

    const done = cache.invalidateMetrics("user-9", "org-9", "metric-5");
    await Promise.resolve();

    expect(invalidateCacheByPattern).toHaveBeenCalledTimes(2);
    finish();
    await done;
  });

  it("logs error payloads when invalidation fails", async () => {
    const boom = new Error("boom");
    invalidateCacheByPattern.mockRejectedValueOnce(boom);

    await cache.invalidateMetrics("user-3", "org-3");

    expect(logCacheInvalidationError).toHaveBeenCalledWith(
      "metric-cache",
      boom,
      { userId: "user-3", organizationId: "org-3", metricId: "-" },
    );
  });
});
