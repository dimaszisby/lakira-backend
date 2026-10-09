import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import logger from "@/utils/logger.js";
import { cacheEntryName } from "@/utils/cache-entry-name.js";
import { MetricCategoryCacheRedis } from "@/features/metric-category/infrastructure/cache/MetricCategoryCacheRedis.js";
import { VisualizationCacheRedis } from "@/features/analytics/infrastructure/cache/VisualizationCacheRedis.js";

// Kit log-redaction-coverage, D-09. A stored value that does not parse used
// to throw out of the reader, and JSON.parse's message quotes the start of
// the value, a cached response, into the error handler's log line. Each
// reader now treats it as a miss and names the entry.
jest.mock("@/utils/redis-client.js", () => ({
  redisClient: { isOpen: true, get: jest.fn() },
  invalidateCacheByPattern: jest.fn(),
}));

const { redisClient } = jest.requireMock("@/utils/redis-client.js") as {
  redisClient: {
    get: jest.MockedFunction<(key: string) => Promise<string | null>>;
  };
};

const CORRUPT = '{"owner":"victim@example.com"';

describe("cache readers: a stored value that does not parse", () => {
  let warnSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.get.mockResolvedValue(CORRUPT);
    warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger);
  });

  const expectNamedOnly = (key: string) => {
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      `[CACHE] unreadable entry ${cacheEntryName(key)}`,
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("victim");
  };

  it("is a miss for the category cache", async () => {
    const key = "cursor:metric-categories:v1:user-1:org:org-1:q:x";

    await expect(new MetricCategoryCacheRedis().get(key)).resolves.toBeNull();

    expectNamedOnly(key);
  });

  it("is a miss for a single visualization", async () => {
    const result = await new VisualizationCacheRedis().getSingleVisualization({
      userId: "user-1",
      organizationId: "org-1",
      metricId: "metric-1",
      startISO: "2025-01-01T00:00:00.000Z",
      endISO: "2025-01-02T00:00:00.000Z",
      bucket: "1d",
      bucketIso: "P1D",
      tz: "UTC",
      fill: "none",
    });

    expect(result).toBeNull();
    expectNamedOnly(redisClient.get.mock.calls[0][0]);
  });

  it("is a miss for a dashboard visualization", async () => {
    const result =
      await new VisualizationCacheRedis().getDashboardVisualization({
        userId: "user-1",
        organizationId: "org-1",
        metricIds: ["metric-1"],
        startISO: "2025-01-01T00:00:00.000Z",
        endISO: "2025-01-02T00:00:00.000Z",
        bucket: "1d",
        bucketIso: "P1D",
        tz: "UTC",
        fill: "none",
        versionCursor: "v",
      });

    expect(result).toBeNull();
    expectNamedOnly(redisClient.get.mock.calls[0][0]);
  });
});
