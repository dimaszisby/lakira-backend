import { VisualizationReadRepoSequelize } from "@/features/analytics/infrastructure/persistence/VisualizationReadRepoSequelize.js";
import { resolveBucket } from "@/features/analytics/domain/buckets.js";
import type {
  VisualizationCachePort,
  DashboardVizCacheKey,
  SingleVizCacheKey,
} from "@/features/analytics/application/ports/VisualizationCachePort.js";
import type {
  VizResponse,
  DashboardVizResponse,
  DashboardVizItem,
} from "@/features/analytics/domain/types.js";
import { sequelize } from "@/infrastructure/db/models.js";
import {
  createUserRow,
  seedDashboardMetric,
  seedDashboardWithMetrics,
  seedMetricWithLogs,
  truncateAllTables,
  TEST_ORG_ID,
} from "../../helpers/db-fixtures.js";

class InMemoryVizCache implements VisualizationCachePort {
  singleStore = new Map<string, VizResponse>();
  dashboardStore = new Map<string, DashboardVizResponse>();
  singleHitsFromCache = 0;
  dashboardHitsFromCache = 0;

  private keySingle(key: SingleVizCacheKey) {
    return JSON.stringify(key);
  }

  private keyDashboard(key: DashboardVizCacheKey) {
    return JSON.stringify(key);
  }

  async getSingleVisualization(
    key: SingleVizCacheKey,
  ): Promise<VizResponse | null> {
    const stored = this.singleStore.get(this.keySingle(key)) ?? null;
    if (stored) this.singleHitsFromCache += 1;
    return stored;
  }

  async setSingleVisualization(
    key: SingleVizCacheKey,
    payload: VizResponse,
  ): Promise<void> {
    this.singleStore.set(this.keySingle(key), payload);
  }

  async getDashboardVisualization(
    key: DashboardVizCacheKey,
  ): Promise<DashboardVizResponse | null> {
    const stored = this.dashboardStore.get(this.keyDashboard(key)) ?? null;
    if (stored) this.dashboardHitsFromCache += 1;
    return stored;
  }

  async setDashboardVisualization(
    key: DashboardVizCacheKey,
    payload: DashboardVizResponse,
  ): Promise<void> {
    this.dashboardStore.set(this.keyDashboard(key), payload);
  }
}

describe("VisualizationReadRepoSequelize (integration)", () => {
  const bucketSpec = resolveBucket("1d");
  let cache: InMemoryVizCache;
  let repo: VisualizationReadRepoSequelize;

  beforeEach(async () => {
    await truncateAllTables();
    cache = new InMemoryVizCache();
    repo = new VisualizationReadRepoSequelize(cache);
  });

  // Developer note: happy-path single-metric visualization fetch covering SQL + cache hydration.
  it("fetches single metric visualization with averages and caches subsequent calls", async () => {
    const { user, metric } = await seedMetricWithLogs({
      metricOverrides: {
        defaultUnit: "km",
      },
      logs: [
        {
          logValue: 5,
          loggedAt: new Date("2025-03-01T00:00:00Z"),
        },
        {
          logValue: 10,
          loggedAt: new Date("2025-03-02T00:00:00Z"),
        },
        {
          logValue: 15,
          loggedAt: new Date("2025-03-03T00:00:00Z"),
        },
      ],
    });

    const startISO = "2025-03-01T00:00:00Z";
    const endISO = "2025-03-05T00:00:00Z";
    const first = await repo.fetchVisualization({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      metricId: metric.id,
      startISO,
      endISO,
      bucket: "1d",
      bucketSpec,
      tz: "UTC",
      fill: "zero",
    });

    expect(first.series).toHaveLength(4);
    const seriesValues = first.series.map(
      (point: VizResponse["series"][number]) => point.value,
    );
    expect(seriesValues).toEqual([5, 10, 15, 0]);
    expect(first.stats.count).toBe(3);
    expect(first.meta.unit).toBe("km");

    const second = await repo.fetchVisualization({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      metricId: metric.id,
      startISO,
      endISO,
      bucket: "1d",
      bucketSpec,
      tz: "UTC",
      fill: "zero",
    });
    expect(second).toBe(first);
    expect(cache.singleHitsFromCache).toBe(1);
  });

  it("builds dashboard visualization lists for display-ready metrics and caches them", async () => {
    const {
      user,
      metrics: [metricASeed, metricBSeed],
    } = await seedDashboardWithMetrics({
      metrics: [
        {
          metricOverrides: { name: "Run" },
          settingsOverrides: {
            displayOptions: {
              showOnDashboard: true,
              priority: 1,
              chartType: "line",
              color: "#111111",
            },
          },
          logs: [
            {
              logValue: 30,
              loggedAt: new Date("2025-04-10T00:00:00Z"),
            },
          ],
        },
        {
          metricOverrides: { name: "Lift" },
          settingsOverrides: {
            displayOptions: {
              showOnDashboard: true,
              priority: 2,
              chartType: "bar",
              color: "#222222",
            },
          },
          logs: [
            {
              logValue: 60,
              loggedAt: new Date("2025-04-11T00:00:00Z"),
            },
          ],
        },
      ],
    });

    const params = {
      userId: user.id,
      organizationId: TEST_ORG_ID,
      startISO: "2025-04-09T00:00:00Z",
      endISO: "2025-04-13T00:00:00Z",
      bucket: "1d" as const,
      bucketSpec,
      tz: "UTC",
      fill: "none" as const,
      limit: 5,
    };

    const first = await repo.fetchDashboardVisualization(params);
    const metricIds = first.items
      .map((item: DashboardVizItem) => item.metricId)
      .sort();
    expect(metricIds).toEqual(
      [metricASeed.metric.id, metricBSeed.metric.id].sort(),
    );
    expect(first.meta.count).toBe(2);
    expect(first.sync.etagSeed).toBeDefined();
    expect(
      first.items.every(
        (item: DashboardVizItem) => (item.series ?? []).length > 0,
      ),
    ).toBe(true);

    const second = await repo.fetchDashboardVisualization(params);
    expect(second).toBe(first);
    expect(cache.dashboardHitsFromCache).toBe(1);
  });
  // Kit deterministic-query-ordering, D-01. Two dashboard metrics tied on
  // priority and settings created_at, with room for one: the one returned must
  // be decided by settings id, not by whichever row Postgres read first. The
  // smaller id is inserted first because the tie-breaker is DESC.
  it("breaks a priority and created_at tie at the limit by settings id", async () => {
    const lowSettingsId = "00000000-0000-4000-8000-0000000000c1";
    const highSettingsId = "ffffffff-ffff-4fff-bfff-ffffffffffc1";
    const displayOptions = {
      showOnDashboard: true,
      priority: 1,
      chartType: "line" as const,
      color: "#111111",
    };
    const {
      user,
      metrics: [, highSeed],
    } = await seedDashboardWithMetrics({
      metrics: [
        {
          metricOverrides: { name: "Low" },
          settingsOverrides: { id: lowSettingsId, displayOptions },
          logs: [{ logValue: 1, loggedAt: new Date("2025-04-10T00:00:00Z") }],
        },
        {
          metricOverrides: { name: "High" },
          settingsOverrides: { id: highSettingsId, displayOptions },
          logs: [{ logValue: 2, loggedAt: new Date("2025-04-10T00:00:00Z") }],
        },
      ],
    });
    await sequelize.query(
      "UPDATE metric_settings SET created_at = '2025-01-01T00:00:00Z' WHERE id IN (:ids)",
      { replacements: { ids: [lowSettingsId, highSettingsId] } },
    );

    const result = await repo.fetchDashboardVisualization({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      startISO: "2025-04-09T00:00:00Z",
      endISO: "2025-04-13T00:00:00Z",
      bucket: "1d" as const,
      bucketSpec,
      tz: "UTC",
      fill: "none" as const,
      limit: 1,
    });

    expect(result.items.map((item: DashboardVizItem) => item.metricId)).toEqual(
      [highSeed.metric.id],
    );
  });

  // Kit deterministic-query-ordering, D-04. When New York leaves daylight
  // saving time, 05:30Z and 06:30Z are both 01:30 local, so the two logs tie on
  // local time. The latest value must be the later instant. The earlier log is
  // inserted first and has the higher id, so neither insertion order nor an id
  // tie-breaker on local time gives the right answer.
  it("takes the latest value from the later instant when two logs share a local time", async () => {
    const {
      user,
      metrics: [seed],
    } = await seedDashboardWithMetrics({
      metrics: [
        {
          metricOverrides: { name: "Weight" },
          settingsOverrides: {
            displayOptions: {
              showOnDashboard: true,
              priority: 1,
              chartType: "line",
              color: "#111111",
            },
          },
          logs: [
            {
              id: "ffffffff-ffff-4fff-bfff-0000000000d4",
              logValue: 10,
              loggedAt: new Date("2025-11-02T05:30:00Z"),
            },
            {
              id: "00000000-0000-4000-8000-0000000000d4",
              logValue: 20,
              loggedAt: new Date("2025-11-02T06:30:00Z"),
            },
          ],
        },
      ],
    });

    const result = await repo.fetchDashboardVisualization({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      startISO: "2025-11-01T04:00:00Z",
      endISO: "2025-11-04T05:00:00Z",
      bucket: "1d" as const,
      bucketSpec,
      tz: "America/New_York",
      fill: "none" as const,
      limit: 5,
    });

    expect(
      result.items.map((item: DashboardVizItem) => [
        item.metricId,
        item.latestValue,
      ]),
    ).toEqual([[seed.metric.id, 20]]);
  });

  // Kit deterministic-query-ordering, D-05. The range's first bucket (04-09)
  // is empty, and the two days that hold logs hold different numbers of them,
  // so reading the first bucket, the last bucket, or an average of the bucket
  // averages each gives a different wrong answer. Both endpoints must agree.
  it("computes stats over the whole series, the same on both endpoints", async () => {
    const {
      user,
      metrics: [seed],
    } = await seedDashboardWithMetrics({
      metrics: [
        {
          metricOverrides: { name: "Pace" },
          settingsOverrides: {
            displayOptions: {
              showOnDashboard: true,
              priority: 1,
              chartType: "line",
              color: "#111111",
            },
          },
          logs: [
            { logValue: 10, loggedAt: new Date("2025-04-10T08:00:00Z") },
            { logValue: 20, loggedAt: new Date("2025-04-11T08:00:00Z") },
            { logValue: 20, loggedAt: new Date("2025-04-11T12:00:00Z") },
            { logValue: 20, loggedAt: new Date("2025-04-11T16:00:00Z") },
          ],
        },
      ],
    });

    const range = {
      userId: user.id,
      organizationId: TEST_ORG_ID,
      startISO: "2025-04-09T00:00:00Z",
      endISO: "2025-04-13T00:00:00Z",
      bucket: "1d" as const,
      bucketSpec,
      tz: "UTC",
      fill: "none" as const,
    };
    const expected = { average: 17.5, min: 10, max: 20, count: 4 };

    const dashboard = await repo.fetchDashboardVisualization({
      ...range,
      limit: 5,
    });
    expect(dashboard.items).toHaveLength(1);
    expect(dashboard.items[0].fallbackRangeUsed).toBe(false);
    expect(dashboard.items[0].stats).toEqual(expected);

    const single = await repo.fetchVisualization({
      ...range,
      metricId: seed.metric.id,
    });
    expect(single.stats).toEqual(expected);
  });
});
