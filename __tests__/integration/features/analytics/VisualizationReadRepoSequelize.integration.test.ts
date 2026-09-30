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
});
