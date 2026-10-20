import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import { VisualizationCacheRedis } from "@/features/analytics/infrastructure/cache/VisualizationCacheRedis.js";
import type {
  FillMode,
  VizResponse,
  DashboardVizResponse,
} from "@/features/analytics/domain/types.js";
import type {
  SingleVizCacheKey,
  DashboardVizCacheKey,
} from "@/features/analytics/application/ports/VisualizationCachePort.js";
import type { BucketAlias } from "@/features/analytics/domain/buckets.js";

jest.mock("@/utils/redis-client.js", () => ({
  redisClient: {
    isOpen: true,
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const { redisClient } = jest.requireMock("@/utils/redis-client.js") as {
  redisClient: {
    isOpen: boolean;
    get: jest.MockedFunction<(key: string) => Promise<string | null>>;
    set: jest.MockedFunction<
      (key: string, value: string, options: { EX: number }) => Promise<void>
    >;
  };
};

const TEST_ORG_ID = "org-test-id";

const cache = new VisualizationCacheRedis();

const singleKey: SingleVizCacheKey = {
  userId: "user-1",
  organizationId: TEST_ORG_ID,
  metricId: "metric-2",
  bucket: "1d" as BucketAlias,
  bucketIso: "1d",
  startISO: "2024-01-01T00:00:00.000Z",
  endISO: "2024-01-31T00:00:00.000Z",
  tz: "UTC",
  fill: "zero" as FillMode,
};

const dashKey: DashboardVizCacheKey = {
  userId: "user-1",
  organizationId: TEST_ORG_ID,
  metricIds: ["metric-2", "metric-3"],
  bucket: "1w" as BucketAlias,
  bucketIso: "1w",
  startISO: "2024-01-01T00:00:00.000Z",
  endISO: "2024-02-01T00:00:00.000Z",
  tz: "UTC",
  fill: "zero" as FillMode,
  versionCursor: "v2",
};

// Hard-coded literals, deliberately NOT recomputed from the fixtures. These helpers
// previously mirrored the key algorithm, which meant they would have kept passing
// against the org-less keys ADR-0035 exists to prevent. A literal is the only form
// that actually pins the key shape.
const EXPECTED_SINGLE_KEY =
  "viz:org-test-id:user-1:metric-2:1d:pXpViiRLk2z5YFNX";
// The hash moved when the dashboard key gained its response version
// (query-values-mean-what-they-say D-01): an entry written before is never read.
const EXPECTED_DASH_KEY = "vizdash:org-test-id:user-1:1w:xP4vVE9eYFmtq1Ra";

const computeSingleCacheKey = () => EXPECTED_SINGLE_KEY;
const computeDashCacheKey = () => EXPECTED_DASH_KEY;

describe("VisualizationCacheRedis", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.isOpen = true;
    redisClient.get.mockResolvedValue(null);
  });

  describe("single visualization cache", () => {
    it("returns null when redis is closed", async () => {
      redisClient.isOpen = false;

      expect(await cache.getSingleVisualization(singleKey)).toBeNull();
      await cache.setSingleVisualization(singleKey, sampleVizPayload());

      expect(redisClient.get).not.toHaveBeenCalled();
      expect(redisClient.set).not.toHaveBeenCalled();
    });

    it("reads cached payload using deterministic key", async () => {
      const payload = { cached: true };
      redisClient.get.mockResolvedValueOnce(JSON.stringify(payload));

      const result = await cache.getSingleVisualization(singleKey);

      expect(result).toEqual(payload);
      expect(redisClient.get).toHaveBeenCalledWith(computeSingleCacheKey());
    });

    it("writes payload with TTL", async () => {
      await cache.setSingleVisualization(singleKey, sampleVizPayload());

      expect(redisClient.set).toHaveBeenCalledWith(
        computeSingleCacheKey(),
        JSON.stringify(sampleVizPayload()),
        { EX: 120 },
      );
    });
  });

  describe("dashboard visualization cache", () => {
    it("returns null when redis is closed", async () => {
      redisClient.isOpen = false;

      expect(await cache.getDashboardVisualization(dashKey)).toBeNull();
      await cache.setDashboardVisualization(dashKey, sampleDashboardPayload());
      expect(redisClient.get).not.toHaveBeenCalled();
    });

    it("reads cached dashboard payloads", async () => {
      const payload = [{ metricId: "metric-2" }];
      redisClient.get.mockResolvedValueOnce(JSON.stringify(payload));

      const result = await cache.getDashboardVisualization(dashKey);

      expect(result).toEqual(payload);
      expect(redisClient.get).toHaveBeenCalledWith(computeDashCacheKey());
    });

    it("writes dashboard payloads with TTL", async () => {
      await cache.setDashboardVisualization(dashKey, sampleDashboardPayload());

      expect(redisClient.set).toHaveBeenCalledWith(
        computeDashCacheKey(),
        JSON.stringify(sampleDashboardPayload()),
        { EX: 120 },
      );
    });
  });

  it("produces a different key for the same user in a different organization", async () => {
    redisClient.get.mockResolvedValue(null);

    await cache.getSingleVisualization(singleKey);
    await cache.getSingleVisualization({
      ...singleKey,
      organizationId: "org-other",
    });

    const [[firstKey], [secondKey]] = redisClient.get.mock.calls;
    expect(firstKey).toBe(EXPECTED_SINGLE_KEY);
    expect(secondKey).toBe("viz:org-other:user-1:metric-2:1d:cAUIwxiRILqLNkYb");
    expect(firstKey).not.toBe(secondKey);
  });

  it("produces a different dashboard key across organizations", async () => {
    redisClient.get.mockResolvedValue(null);

    await cache.getDashboardVisualization(dashKey);
    await cache.getDashboardVisualization({
      ...dashKey,
      organizationId: "org-other",
    });

    const [[firstKey], [secondKey]] = redisClient.get.mock.calls;
    expect(firstKey).toBe(EXPECTED_DASH_KEY);
    expect(firstKey).not.toBe(secondKey);
  });
});
const sampleVizPayload = (): VizResponse => ({
  metricId: singleKey.metricId,
  series: [],
  stats: { average: null, min: null, max: null, count: 0 },
  meta: {
    metricId: singleKey.metricId,
    unit: "unit",
    bucket: singleKey.bucket,
    tz: singleKey.tz,
    range: { startISO: singleKey.startISO, endISO: singleKey.endISO },
    fill: singleKey.fill,
  },
});

const sampleDashboardPayload = (): DashboardVizResponse => ({
  items: [
    {
      metricId: "metric-2",
      name: "Metric 2",
      unit: "unit",
      category_name: null,
      category_icon: null,
      category_color: null,
      priority: null,
      series: [],
      stats: { average: null, min: null, max: null, count: 0 },
      lastLogAt: null,
      firstLogAt: null,
      totalLogs: 0,
      latestValue: null,
      latestBucketStart: null,
      requestedRange: {
        startISO: dashKey.startISO,
        endISO: dashKey.endISO,
        bucket: dashKey.bucket,
      },
      actualRange: {
        startISO: dashKey.startISO,
        endISO: dashKey.endISO,
        bucket: dashKey.bucket,
      },
      fallbackRangeUsed: false,
      fallbackStrategy: null,
    },
  ],
  meta: {
    bucket: dashKey.bucket,
    tz: dashKey.tz,
    range: { startISO: dashKey.startISO, endISO: dashKey.endISO },
    count: 1,
    totalMetrics: 1,
    fallbackMetrics: 0,
  },
  sync: { etagSeed: "seed" },
});
