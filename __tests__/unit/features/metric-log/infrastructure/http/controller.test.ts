import { jest } from "@jest/globals";
import type {
  ListLogsResult,
  ListOpts,
} from "@/features/metric-log/application/ports/MetricLogQueryPort.js";
type ControllerModule =
  typeof import("@/features/metric-log/infrastructure/http/controller.js");
type Handlers = ReturnType<ControllerModule["createMetricLogController"]>;

const pickValidatedMock = jest.fn();
jest.mock("@/shared/middleware/validated.js", () => ({
  pickValidated: (schema: unknown) => pickValidatedMock(schema),
}));

const createLogExecute = jest.fn<(args: any) => Promise<any>>();
const getLogExecute = jest.fn<(args: any) => Promise<any>>();
const updateLogExecute = jest.fn<(args: any) => Promise<any>>();
const deleteLogExecute = jest.fn<(args: any) => Promise<any>>();
const getStatsExecute = jest.fn<(args: any) => Promise<any>>();
const generateDummyExecute = jest.fn<(args: any) => Promise<any>>();
const listLogsExecute = jest.fn<(args: ListOpts) => Promise<ListLogsResult>>();
const userId = "00000000-0000-0000-0000-000000000001";
const orgId = "aaaaaaaa-0000-0000-0000-000000000001";
const metricId = "11111111-1111-1111-1111-111111111111";
const logId = "22222222-2222-2222-2222-222222222222";

const authFields = {
  user: { id: userId },
  organizationId: orgId,
  membership: { id: "mem-1", role: "owner", organizationId: orgId, userId },
};

const makeRes = () => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
};

describe("Metric log controller", () => {
  let createMetricLog: Handlers["createMetricLog"];
  let getLogById: Handlers["getLogById"];
  let getAggregatedStats: Handlers["getAggregatedStats"];
  let generateDummyMetricLogs: Handlers["generateDummyMetricLogs"];
  let getUserLogLibrariesViaCursor: Handlers["getUserLogLibrariesViaCursor"];
  let createMetricLogController: ControllerModule["createMetricLogController"];

  beforeAll(async () => {
    ({ createMetricLogController } =
      await import("@/features/metric-log/infrastructure/http/controller.js"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pickValidatedMock.mockImplementation(() => (req: any) => ({
      body: req.body ?? {},
      params: req.params ?? {},
      query: req.query ?? {},
    }));
    ({
      createMetricLog,
      getLogById,
      getAggregatedStats,
      generateDummyMetricLogs,
      getUserLogLibrariesViaCursor,
    } = createMetricLogController({
      createLog: { execute: createLogExecute },
      getLog: { execute: getLogExecute },
      updateLog: { execute: updateLogExecute },
      deleteLog: { execute: deleteLogExecute },
      getStats: { execute: getStatsExecute },
      generateDummyLogs: { execute: generateDummyExecute },
      listLogs: { execute: listLogsExecute },
    } as any));
    listLogsExecute.mockResolvedValue({
      items: [],
      sort: "-createdAt",
      limit: 20,
    });
  });

  it("creates metric log through feature use case", async () => {
    const req: any = {
      ...authFields,
      body: { metricId, logValue: 10, type: "manual" },
    };
    const log = {
      id: logId,
      metricId,
      logValue: 10,
      type: "manual",
      loggedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    createLogExecute.mockResolvedValue(log as any);

    const res = makeRes();
    await createMetricLog(req, res, jest.fn());

    expect(createLogExecute).toHaveBeenCalledWith({
      userId,
      metricId,
      logValue: 10,
      type: "manual",
      loggedAt: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("fetches metric log by id", async () => {
    const log = {
      id: logId,
      metricId,
      logValue: 10,
      type: "manual",
      loggedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    getLogExecute.mockResolvedValue(log as any);
    const req: any = {
      ...authFields,
      params: { id: logId },
      query: { metricId },
    };

    const res = makeRes();
    await getLogById(req, res, jest.fn());

    expect(getLogExecute).toHaveBeenCalledWith({
      userId,
      logId,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns aggregated stats via feature", async () => {
    getStatsExecute.mockResolvedValue({ average: 0, min: 0, max: 0 } as any);
    const req: any = { ...authFields, query: {} };

    const res = makeRes();
    await getAggregatedStats(req, res, jest.fn());

    expect(getStatsExecute).toHaveBeenCalledWith({
      userId,
      metricId: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("lists logs via feature query", async () => {
    const req: any = {
      ...authFields,
      query: {
        limit: 10,
        sort: "-createdAt",
        includeTotal: true,
        filter: { metricId },
      },
    };
    const res = makeRes();

    await getUserLogLibrariesViaCursor(req, res, jest.fn());

    expect(listLogsExecute).toHaveBeenCalledWith({
      userId,
      limit: 10,
      sort: "-createdAt",
      q: undefined,
      filter: { metricId },
      after: undefined,
      includeTotal: true,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("generates dummy logs via feature", async () => {
    const jobId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    generateDummyExecute.mockResolvedValue({ jobId } as any);
    const req: any = {
      ...authFields,
      params: { metricId },
      body: { count: 5 },
    };

    const res = makeRes();
    await generateDummyMetricLogs(req, res, jest.fn());

    expect(generateDummyExecute).toHaveBeenCalledWith({
      userId,
      metricId,
      count: 5,
    });
    expect(res.status).toHaveBeenCalledWith(202);
  });
});
