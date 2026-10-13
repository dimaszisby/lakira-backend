import { jest } from "@jest/globals";
import { GetDashboardVisualization } from "@/features/analytics/application/queries/GetDashboardVisualization.js";
import { VisualizationReadRepoSequelize } from "@/features/analytics/infrastructure/persistence/VisualizationReadRepoSequelize.js";
import type { VisualizationCachePort } from "@/features/analytics/application/ports/VisualizationCachePort.js";
import { sequelize } from "@/infrastructure/db/models.js";

const TEST_ORG_ID = "org-test-id";

const defaultInput = {
  userId: "user-123",
  organizationId: TEST_ORG_ID,
  startISO: "2024-01-01T00:00:00.000Z",
  endISO: "2024-01-31T00:00:00.000Z",
  bucket: "1d" as const,
  tz: "UTC",
  fill: "none" as const,
  limit: 12,
};

const buildService = () => {
  const cache: VisualizationCachePort = {
    async getSingleVisualization() {
      return null;
    },
    async setSingleVisualization() {
      // no-op for tests
    },
    async getDashboardVisualization() {
      return null;
    },
    async setDashboardVisualization() {
      // no-op for tests
    },
  };
  const repo = new VisualizationReadRepoSequelize(cache);
  const service = new GetDashboardVisualization(repo);
  return { service };
};

describe("GetDashboardVisualization service", () => {
  const querySpy = jest.spyOn(
    sequelize,
    "query",
  ) as unknown as jest.MockedFunction<(...args: any[]) => Promise<any>>;

  afterEach(() => {
    querySpy.mockReset();
  });

  afterAll(() => {
    querySpy.mockRestore();
  });

  it("returns lifecycle metadata and fallback series when requested window is empty", async () => {
    querySpy
      // metrics
      .mockResolvedValueOnce([
        {
          metric_id: "metric-1",
          name: "Support Tickets",
          unit: "count",
          category_name: null,
          category_icon: null,
          category_color: null,
          priority: 1,
          total_count: 1,
          metric_updated_at: "2024-02-10T00:00:00.000Z",
          metric_settings_updated_at: "2024-02-09T00:00:00.000Z",
          category_updated_at: null,
        },
      ])
      // requested window rows (empty)
      .mockResolvedValueOnce([])
      // lifecycle aggregation
      .mockResolvedValueOnce([
        {
          metric_id: "metric-1",
          first_log_at: "2023-09-01T00:00:00.000Z",
          last_log_at: "2023-10-01T00:00:00.000Z",
          total_logs: 9,
          latest_value: 4,
          latest_bucket_start: "2023-10-01T00:00:00.000Z",
        },
      ])
      // fallback rows
      .mockResolvedValueOnce([
        {
          metric_id: "metric-1",
          bucket_start: "2023-09-28T00:00:00.000Z",
          avg_value: 4,
          min_value: 4,
          max_value: 4,
          cnt: 1,
        },
      ]);

    const { service } = buildService();
    const result = await service.execute(defaultInput);
    expect(result.meta.totalMetrics).toBe(1);
    expect(result.meta.fallbackMetrics).toBe(1);
    expect(result.items).toHaveLength(1);

    const metric = result.items[0];
    expect(metric.fallbackRangeUsed).toBe(true);
    // The end of the day that holds the last log, so the log is inside the range.
    expect(metric.actualRange.endISO).toBe("2023-10-02T00:00:00.000Z");
    expect(metric.series).toHaveLength(1);
    expect(metric.lastLogAt).toBe("2023-10-01T00:00:00.000Z");
    expect(metric.totalLogs).toBe(9);
    expect(metric.stats.count).toBe(1);
    expect(result.sync.etagSeed).toBeDefined();
  });

  it("updates etag seed when metric metadata timestamps change", async () => {
    querySpy
      .mockResolvedValueOnce([
        {
          metric_id: "metric-2",
          name: "Response Time",
          unit: "ms",
          category_name: "Ops",
          category_icon: "⚙️",
          category_color: "#000000",
          priority: 2,
          total_count: 1,
          metric_updated_at: "2024-02-10T00:00:00.000Z",
          metric_settings_updated_at: "2024-02-09T00:00:00.000Z",
          category_updated_at: "2024-02-08T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          metric_id: "metric-2",
          bucket_start: "2024-01-01T00:00:00.000Z",
          avg_value: 100,
          min_value: 100,
          max_value: 100,
          cnt: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          metric_id: "metric-2",
          first_log_at: "2024-01-01T00:00:00.000Z",
          last_log_at: "2024-01-01T00:00:00.000Z",
          total_logs: 1,
          latest_value: 100,
          latest_bucket_start: "2024-01-01T00:00:00.000Z",
        },
      ]);

    const { service } = buildService();
    const first = await service.execute(defaultInput);
    expect(first.sync.etagSeed).toBeDefined();

    querySpy.mockReset();
    querySpy
      .mockResolvedValueOnce([
        {
          metric_id: "metric-2",
          name: "Response Time",
          unit: "ms",
          category_name: "Ops",
          category_icon: "⚙️",
          category_color: "#000000",
          priority: 2,
          total_count: 1,
          metric_updated_at: "2024-02-11T00:00:00.000Z",
          metric_settings_updated_at: "2024-02-09T00:00:00.000Z",
          category_updated_at: "2024-02-08T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          metric_id: "metric-2",
          bucket_start: "2024-01-01T00:00:00.000Z",
          avg_value: 100,
          min_value: 100,
          max_value: 100,
          cnt: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          metric_id: "metric-2",
          first_log_at: "2024-01-01T00:00:00.000Z",
          last_log_at: "2024-01-01T00:00:00.000Z",
          total_logs: 1,
          latest_value: 100,
          latest_bucket_start: "2024-01-01T00:00:00.000Z",
        },
      ]);

    const second = await service.execute(defaultInput);
    expect(second.sync.etagSeed).toBeDefined();
    expect(second.sync.etagSeed).not.toEqual(first.sync.etagSeed);
    expect(second.meta.totalMetrics).toBe(1);
    expect(second.meta.fallbackMetrics).toBe(0);
    expect(second.items[0].fallbackRangeUsed).toBe(false);
  });
});
