import { jest } from "@jest/globals";
import { MetricReadRepoSequelize } from "@/features/metric/infrastructure/persistence/repositories/MetricReadRepoSequelize.js";
import { models } from "@/infrastructure/db/models.js";

const TEST_ORG_ID = "org-test-id";

describe("MetricReadRepoSequelize", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns paginated list results with cursor + total", async () => {
    const baseMetric = {
      categoryId: null,
      originalMetricId: null,
      description: "desc",
      defaultUnit: "steps",
      isPublic: true,
      deletedAt: null,
      // The association's alias, as the list's include returns it (#314). This held
      // `MetricSettings`, a key the query never filled, which is how the bug hid.
      settings: { goalType: "cumulative" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Use plain objects to mimic the minimal shape returned by Sequelize when attributes are stripped.
    const rows = [
      { ...baseMetric, id: "metric-1", userId: "user-1", name: "Steps" },
      { ...baseMetric, id: "metric-2", userId: "user-1", name: "Sleep" },
      { ...baseMetric, id: "metric-3", userId: "user-1", name: "Water" },
    ];
    const findAll = jest
      .spyOn(models.Metric, "findAll")
      .mockResolvedValue(rows as any);
    const count = jest
      .spyOn(models.Metric, "count")
      .mockResolvedValue(42 as any);

    const repo = new MetricReadRepoSequelize();

    const result = await repo.listMetrics({
      userId: "user-1",
      organizationId: TEST_ORG_ID,
      limit: 2,
      sort: "-createdAt",
      q: "ste",
      filter: { categoryId: "cat-1" },
      includeTotal: true,
    });

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.any(Object),
        limit: 3,
        include: expect.any(Array),
        order: expect.any(Array),
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: expect.any(Object),
      paranoid: false,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.goalType).toBe("cumulative");
    const include = (findAll.mock.calls[0]![0] as { include: unknown[] })
      .include;
    expect(include).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          as: "settings",
          attributes: ["id", "goalType"],
          required: false,
        }),
      ]),
    );
    expect(result.limit).toBe(2);
    expect(result.nextCursor).toBeDefined();
    expect(result.totalCount).toBe(42);
  });

  it("fetches detailed metric with requested includes", async () => {
    const metricRow = {
      id: "metric-1",
      userId: "user-1",
      categoryId: null,
      originalMetricId: null,
      name: "Steps",
      description: "desc",
      defaultUnit: "steps",
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      // The include aliases, the keys the detail query fills (#314 review).
      category: {
        id: "cat-1",
        name: "Fitness",
        icon: "🔥",
        color: "#fff",
      },
      settings: {
        goalType: "cumulative",
      },
      logs: [],
    };
    const findOne = jest
      .spyOn(models.Metric, "findOne")
      .mockResolvedValue(metricRow as any);

    const repo = new MetricReadRepoSequelize();

    const result = await repo.findDetailedMetric({
      userId: "user-1",
      organizationId: TEST_ORG_ID,
      metricId: "metric-1",
      includes: ["category", "settings", "logs"],
      logsLimit: 5,
    });

    expect(findOne).toHaveBeenCalledWith({
      where: { id: "metric-1", userId: "user-1", organizationId: TEST_ORG_ID },
      include: expect.arrayContaining([
        expect.objectContaining({ as: "category" }),
        expect.objectContaining({ as: "settings" }),
        expect.objectContaining({ as: "logs", limit: 5 }),
      ]),
    });
    expect(result?.category?.id).toBe("cat-1");
    expect(result?.settings?.goalType).toBe("cumulative");
    expect(result?.id).toBe("metric-1");
    expect(result?.userId).toBe("user-1");
  });
});
