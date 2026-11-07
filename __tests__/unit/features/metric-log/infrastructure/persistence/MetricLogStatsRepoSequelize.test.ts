import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  jest,
} from "@jest/globals";
import { MetricLogStatsRepoSequelize } from "@/features/metric-log/infrastructure/persistence/repositories/MetricLogStatsRepoSequelize.js";
import { Op } from "sequelize";
import { models } from "@/infrastructure/db/models.js";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const METRIC_ID = "metric-1";

type AsyncMock<T = unknown> = jest.MockedFunction<
  (...args: any[]) => Promise<T>
>;

// One aggregate row, as Postgres returns it with `raw: true`: AVG, MIN and MAX of a FLOAT
// column are numbers, COUNT(*) is a bigint string (metric-log-stats-in-sql D-01).
type AggregateRow = {
  average: number | null;
  min: number | null;
  max: number | null;
  count: string;
};
const metricLogModel = {
  findOne: jest.fn() as AsyncMock<AggregateRow | null>,
};
const originalMetricLog = models.MetricLog;
const originalMetric = models.Metric;

beforeAll(() => {
  (models as any).MetricLog = metricLogModel;
  (models as any).Metric = { name: "Metric" };
});

afterAll(() => {
  (models as any).MetricLog = originalMetricLog;
  (models as any).Metric = originalMetric;
});

const repo = new MetricLogStatsRepoSequelize();
const lastCall = () => metricLogModel.findOne.mock.calls[0][0] as any;
const row = (average: number, min: number, max: number, count: number) => ({
  average,
  min,
  max,
  count: String(count),
});

describe("MetricLogStatsRepoSequelize.computeStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns zero stats when no log is in scope", async () => {
    metricLogModel.findOne.mockResolvedValue({
      average: null,
      min: null,
      max: null,
      count: "0",
    });

    const result = await repo.computeStats({
      organizationId: ORG_ID,
      userId: USER_ID,
      metricId: METRIC_ID,
    });

    expect(result).toEqual({ average: 0, min: 0, max: 0 });
  });

  it("asks the database for one aggregate row, not the logs", async () => {
    metricLogModel.findOne.mockResolvedValue(row(20, 10, 30, 3));

    const result = await repo.computeStats({
      organizationId: ORG_ID,
      metricId: METRIC_ID,
    });

    expect(result).toEqual({ average: 20, min: 10, max: 30 });
    const call = lastCall();
    expect(call.raw).toBe(true);
    const aliases = call.attributes.map((a: [unknown, string]) => a[1]);
    expect(aliases).toEqual(["average", "min", "max", "count"]);
  });

  it("scopes by metricId + organizationId and skips the JOIN when metricId is given", async () => {
    metricLogModel.findOne.mockResolvedValue(row(1, 1, 1, 1));

    await repo.computeStats({
      organizationId: ORG_ID,
      userId: USER_ID,
      metricId: METRIC_ID,
    });

    expect(lastCall().where).toEqual({
      metricId: METRIC_ID,
      organizationId: ORG_ID,
    });
    expect(lastCall().include).toBeUndefined();
  });

  it("scopes by organizationId and a userId-scoped INNER JOIN when metricId is omitted", async () => {
    metricLogModel.findOne.mockResolvedValue(row(1, 1, 1, 1));

    await repo.computeStats({ organizationId: ORG_ID, userId: USER_ID });

    expect(lastCall().where).toEqual({ organizationId: ORG_ID });
    expect(lastCall().include).toHaveLength(1);
    expect(lastCall().include[0]).toMatchObject({
      as: "metric",
      attributes: [],
      required: true,
      where: { userId: USER_ID, organizationId: ORG_ID },
    });
  });

  it("bounds loggedAt by a half-open range when one is given", async () => {
    metricLogModel.findOne.mockResolvedValue(row(1, 1, 1, 1));
    const from = new Date("2025-01-01T00:00:00Z");
    const to = new Date("2025-02-01T00:00:00Z");

    await repo.computeStats({
      organizationId: ORG_ID,
      metricId: METRIC_ID,
      from,
      to,
    });
    expect(lastCall().where).toEqual({
      metricId: METRIC_ID,
      organizationId: ORG_ID,
      loggedAt: { [Op.gte]: from, [Op.lt]: to },
    });

    jest.clearAllMocks();
    metricLogModel.findOne.mockResolvedValue(row(1, 1, 1, 1));
    await repo.computeStats({ organizationId: ORG_ID, userId: USER_ID, to });
    expect(lastCall().where).toEqual({
      organizationId: ORG_ID,
      loggedAt: { [Op.lt]: to },
    });
  });
});
