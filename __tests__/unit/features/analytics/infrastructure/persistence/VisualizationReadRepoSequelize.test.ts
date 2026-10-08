import { jest } from "@jest/globals";
import { VisualizationReadRepoSequelize } from "@/features/analytics/infrastructure/persistence/VisualizationReadRepoSequelize.js";
import { models, sequelize } from "@/infrastructure/db/models.js";
import AppError from "@/utils/AppError.js";

const TEST_ORG_ID = "org-test-id";

const bucketSpec = {
  unit: "day",
  iso: "P1D",
  interval: "1 day",
  trunc: "day",
  approxMs: 86_400_000,
} as const;

const makeCache = () => ({
  getSingleVisualization: jest.fn(),
  setSingleVisualization: jest.fn(),
  getDashboardVisualization: jest.fn(),
  setDashboardVisualization: jest.fn(),
});

describe("VisualizationReadRepoSequelize", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns cached single visualization without hitting SQL", async () => {
    const cache = makeCache() as any;
    const cached = {
      metricId: "metric-1",
      series: [],
      stats: { average: null, min: null, max: null, count: 0 },
      meta: {
        metricId: "metric-1",
        unit: "steps",
        bucket: "1d",
        tz: "UTC",
        range: { startISO: "a", endISO: "b" },
        fill: "none",
      },
    };
    cache.getSingleVisualization.mockResolvedValue(cached);
    jest
      .spyOn(models.Metric, "findOne")
      .mockResolvedValue({ id: "metric-1" } as any);
    const querySpy = jest
      .spyOn(sequelize, "query")
      .mockResolvedValue([] as any);

    const repo = new VisualizationReadRepoSequelize(cache as any);
    const result = await repo.fetchVisualization({
      userId: "user-1",
      organizationId: TEST_ORG_ID,
      metricId: "metric-1",
      startISO: "2024-01-01T00:00:00.000Z",
      endISO: "2024-01-02T00:00:00.000Z",
      bucket: "1d",
      bucketSpec,
      tz: "UTC",
      fill: "none",
    });

    expect(result).toBe(cached);
    expect(cache.setSingleVisualization).not.toHaveBeenCalled();
    expect(querySpy).not.toHaveBeenCalled();
  });

  it("throws when metric ownership check fails", async () => {
    const cache = makeCache() as any;
    cache.getSingleVisualization.mockResolvedValue(null);
    jest.spyOn(models.Metric, "findOne").mockResolvedValue(null);

    const repo = new VisualizationReadRepoSequelize(cache as any);

    await expect(
      repo.fetchVisualization({
        userId: "user-1",
        organizationId: TEST_ORG_ID,
        metricId: "metric-9",
        startISO: "2024-01-01T00:00:00.000Z",
        endISO: "2024-01-02T00:00:00.000Z",
        bucket: "1d",
        bucketSpec,
        tz: "UTC",
        fill: "none",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("hydrates dashboard visualization and caches results when empty cache", async () => {
    const cache = makeCache() as any;
    cache.getDashboardVisualization.mockResolvedValue(null);
    const querySpy = jest.spyOn(sequelize, "query");
    querySpy
      .mockResolvedValueOnce([
        {
          metric_id: "metric-1",
          name: "Steps",
          unit: "steps",
          category_name: "cat",
          category_color: "#fff",
          category_icon: "🔥",
          priority: 1,
          total_count: 1,
          metric_updated_at: "2024-01-01T00:00:00.000Z",
          metric_settings_updated_at: "2024-01-01T00:00:00.000Z",
          category_updated_at: "2024-01-01T00:00:00.000Z",
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          metric_id: "metric-1",
          bucket_start: "2024-01-01T00:00:00.000Z",
          avg_value: 2,
          min_value: 1,
          max_value: 3,
          cnt: 1,
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          metric_id: "metric-1",
          first_log_at: "2023-12-31T00:00:00.000Z",
          last_log_at: "2024-01-02T00:00:00.000Z",
          total_logs: 2,
          latest_value: 5,
          latest_bucket_start: "2024-01-02T00:00:00.000Z",
        },
      ] as any);

    const repo = new VisualizationReadRepoSequelize(cache as any);

    const response = await repo.fetchDashboardVisualization({
      userId: "user-1",
      organizationId: TEST_ORG_ID,
      startISO: "2024-01-01T00:00:00.000Z",
      endISO: "2024-01-05T00:00:00.000Z",
      bucket: "1d",
      bucketSpec,
      tz: "UTC",
      fill: "none",
      limit: 5,
    });

    expect(response.items).toHaveLength(1);
    expect(response.items[0].metricId).toBe("metric-1");
    expect(cache.setDashboardVisualization).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        organizationId: TEST_ORG_ID,
        metricIds: ["metric-1"],
      }),
      response,
    );
    expect(querySpy).toHaveBeenCalledTimes(3);
  });

  // Kit deterministic-query-ordering, D-05. The requested range holds no
  // logs, so the fallback series is returned. The stats must describe that
  // series, all of it, and not the empty one that was asked for.
  it("computes dashboard stats over the fallback series when it is used", async () => {
    const cache = makeCache() as any;
    cache.getDashboardVisualization.mockResolvedValue(null);
    const emptyBucket = {
      metric_id: "metric-1",
      avg_value: null,
      min_value: null,
      max_value: null,
      cnt: null,
    };
    const querySpy = jest.spyOn(sequelize, "query");
    querySpy
      .mockResolvedValueOnce([
        {
          metric_id: "metric-1",
          name: "Steps",
          unit: "steps",
          category_name: null,
          category_color: null,
          category_icon: null,
          priority: 1,
          total_count: 1,
          metric_updated_at: "2024-01-01T00:00:00.000Z",
          metric_settings_updated_at: "2024-01-01T00:00:00.000Z",
          category_updated_at: null,
        },
      ] as any)
      .mockResolvedValueOnce([
        { ...emptyBucket, bucket_start: "2024-01-01T00:00:00.000Z" },
        { ...emptyBucket, bucket_start: "2024-01-02T00:00:00.000Z" },
      ] as any)
      .mockResolvedValueOnce([
        {
          metric_id: "metric-1",
          first_log_at: "2023-12-18T00:00:00.000Z",
          last_log_at: "2023-12-20T00:00:00.000Z",
          total_logs: 4,
          latest_value: 20,
          latest_bucket_start: "2023-12-19T00:00:00.000Z",
        },
      ] as any)
      .mockResolvedValueOnce([
        { ...emptyBucket, bucket_start: "2023-12-17T00:00:00.000Z" },
        {
          bucket_start: "2023-12-18T00:00:00.000Z",
          avg_value: 10,
          min_value: 10,
          max_value: 10,
          cnt: 1,
        },
        {
          bucket_start: "2023-12-19T00:00:00.000Z",
          avg_value: 20,
          min_value: 20,
          max_value: 20,
          cnt: 3,
        },
      ] as any);

    const repo = new VisualizationReadRepoSequelize(cache as any);

    const response = await repo.fetchDashboardVisualization({
      userId: "user-1",
      organizationId: TEST_ORG_ID,
      startISO: "2024-01-01T00:00:00.000Z",
      endISO: "2024-01-03T00:00:00.000Z",
      bucket: "1d",
      bucketSpec,
      tz: "UTC",
      fill: "none",
      limit: 5,
    });

    expect(querySpy).toHaveBeenCalledTimes(4);
    expect(response.items[0].fallbackRangeUsed).toBe(true);
    expect(response.items[0].series).toHaveLength(3);
    expect(response.items[0].stats).toEqual({
      average: 17.5,
      min: 10,
      max: 20,
      count: 4,
    });
  });
});
