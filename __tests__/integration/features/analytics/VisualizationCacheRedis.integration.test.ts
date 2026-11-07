import {
  resolveBucket,
  type BucketAlias,
} from "@/features/analytics/domain/buckets.js";
import type {
  FillMode,
  VizResponse,
} from "@/features/analytics/domain/types.js";
import type { DashboardVizResponse } from "@/features/analytics/application/ports/VisualizationReadRepository.js";
import { AnalyticsVisualizationInvalidationAdapter } from "@/features/analytics/infrastructure/cache/VisualizationInvalidationAdapter.js";
import { VisualizationCacheRedis } from "@/features/analytics/infrastructure/cache/VisualizationCacheRedis.js";
import { redisClient } from "@/utils/redis-client.js";
import { env } from "@/config/envManager.js";

const TEST_ORG_ID = "org-test-id";

const bucketAlias: BucketAlias = "1d";
const bucketSpec = resolveBucket(bucketAlias);
const fillMode: FillMode = "zero";
const range = {
  startISO: "2025-05-01T00:00:00.000Z",
  endISO: "2025-05-07T00:00:00.000Z",
};

const singleKey = {
  userId: "redis-user",
  organizationId: TEST_ORG_ID,
  metricId: "redis-metric",
  bucket: bucketAlias,
  bucketIso: bucketSpec.iso,
  startISO: range.startISO,
  endISO: range.endISO,
  tz: "UTC",
  fill: fillMode,
};

const describeRedis = env.ENABLE_REDIS_INTEGRATION ? describe : describe.skip;

describeRedis("VisualizationCacheRedis (integration with Redis)", () => {
  const cache = new VisualizationCacheRedis();
  const invalidator = new AnalyticsVisualizationInvalidationAdapter();

  beforeAll(async () => {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  });

  afterAll(async () => {
    if (redisClient.isOpen) {
      await redisClient.flushDb();
    }
  });

  beforeEach(async () => {
    if (redisClient.isOpen) {
      await redisClient.flushDb();
    }
  });

  it("stores and retrieves single and dashboard visualizations via Redis", async () => {
    const singlePayload: VizResponse = {
      metricId: singleKey.metricId,
      series: [
        { bucketStartISO: "2025-05-01T00:00:00.000Z", value: 10 },
        { bucketStartISO: "2025-05-02T00:00:00.000Z", value: 20 },
      ],
      stats: { min: 10, max: 20, count: 2, average: 15 },
      meta: {
        metricId: singleKey.metricId,
        unit: "kg",
        bucket: bucketAlias,
        tz: singleKey.tz,
        range,
        fill: fillMode,
      },
    };

    await cache.setSingleVisualization(singleKey, singlePayload);
    expect(await cache.getSingleVisualization(singleKey)).toEqual(
      singlePayload,
    );

    const dashboardPayload: DashboardVizResponse = {
      items: [
        {
          metricId: singleKey.metricId,
          name: "Redis Journey Metric",
          unit: "kg",
          category_name: null,
          category_icon: null,
          category_color: null,
          priority: 1,
          series: singlePayload.series,
          stats: singlePayload.stats,
          lastLogAt: singlePayload.series[1]?.bucketStartISO ?? null,
          firstLogAt: singlePayload.series[0]?.bucketStartISO ?? null,
          totalLogs: singlePayload.series.length,
          latestValue: singlePayload.series[1]?.value ?? null,
          latestBucketStart: singlePayload.series[1]?.bucketStartISO ?? null,
          requestedRange: {
            startISO: range.startISO,
            endISO: range.endISO,
            bucket: bucketAlias,
          },
          actualRange: {
            startISO: range.startISO,
            endISO: range.endISO,
            bucket: bucketAlias,
          },
          fallbackRangeUsed: false,
          fallbackStrategy: null,
        },
      ],
      meta: {
        bucket: bucketAlias,
        tz: singleKey.tz,
        range,
        count: 1,
        totalMetrics: 1,
        fallbackMetrics: 0,
      },
      sync: {
        etagSeed: "redis-etag",
      },
    };

    const dashboardKey = {
      userId: singleKey.userId,
      organizationId: TEST_ORG_ID,
      metricIds: [singleKey.metricId],
      bucket: bucketAlias,
      bucketIso: bucketSpec.iso,
      startISO: range.startISO,
      endISO: range.endISO,
      tz: singleKey.tz,
      fill: "none" as FillMode,
      versionCursor: "cursor",
    };

    await cache.setDashboardVisualization(dashboardKey, dashboardPayload);
    expect(await cache.getDashboardVisualization(dashboardKey)).toEqual(
      dashboardPayload,
    );
  });

  it("invalidates cached analytics when logs change", async () => {
    const singlePayload: VizResponse = {
      metricId: singleKey.metricId,
      series: [{ bucketStartISO: range.startISO, value: 50 }],
      stats: { min: 50, max: 50, count: 1, average: 50 },
      meta: {
        metricId: singleKey.metricId,
        unit: "kg",
        bucket: bucketAlias,
        tz: singleKey.tz,
        range,
        fill: fillMode,
      },
    };
    const dashboardPayload: DashboardVizResponse = {
      items: [
        {
          metricId: singleKey.metricId,
          name: "Redis Journey Metric",
          unit: "kg",
          category_name: null,
          category_icon: null,
          category_color: null,
          priority: null,
          series: singlePayload.series,
          stats: singlePayload.stats,
          lastLogAt: range.startISO,
          firstLogAt: range.startISO,
          totalLogs: 1,
          latestValue: 50,
          latestBucketStart: range.startISO,
          requestedRange: {
            startISO: range.startISO,
            endISO: range.endISO,
            bucket: bucketAlias,
          },
          actualRange: {
            startISO: range.startISO,
            endISO: range.endISO,
            bucket: bucketAlias,
          },
          fallbackRangeUsed: false,
          fallbackStrategy: null,
        },
      ],
      meta: {
        bucket: bucketAlias,
        tz: singleKey.tz,
        range,
        count: 1,
        totalMetrics: 1,
        fallbackMetrics: 0,
      },
      sync: {
        etagSeed: "invalidate-seed",
      },
    };

    const dashboardKey = {
      userId: singleKey.userId,
      organizationId: TEST_ORG_ID,
      metricIds: [singleKey.metricId],
      bucket: bucketAlias,
      bucketIso: bucketSpec.iso,
      startISO: range.startISO,
      endISO: range.endISO,
      tz: singleKey.tz,
      fill: "none" as FillMode,
    };

    await cache.setSingleVisualization(singleKey, singlePayload);
    await cache.setDashboardVisualization(dashboardKey, dashboardPayload);
    expect(await cache.getSingleVisualization(singleKey)).not.toBeNull();
    expect(await cache.getDashboardVisualization(dashboardKey)).not.toBeNull();

    await invalidator.invalidateByMetric(
      singleKey.userId,
      singleKey.organizationId,
      singleKey.metricId,
    );

    expect(await cache.getSingleVisualization(singleKey)).toBeNull();
    expect(await cache.getDashboardVisualization(dashboardKey)).toBeNull();
  });
});
