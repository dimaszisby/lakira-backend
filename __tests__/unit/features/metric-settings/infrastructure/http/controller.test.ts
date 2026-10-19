import { jest } from "@jest/globals";
import AppError from "@/utils/AppError.js";
import { createMetricSettingsController } from "@/features/metric-settings/infrastructure/http/controller.js";
import { buildMetricSettings } from "../../../../factories/metric-settings.js";
import { AuthRequest } from "@/types/request.context.js";

const successResponseMock = jest.fn();
jest.mock("@/utils/response-formatter.js", () => ({
  successResponse: (...args: unknown[]) => successResponseMock(...args),
}));

const pickValidatedMock = jest.fn();
jest.mock("@/shared/middleware/validated.js", () => ({
  pickValidated: (schema: unknown) => pickValidatedMock(schema),
}));

const createAsyncMock = <T>() =>
  jest.fn(() => Promise.resolve(null as unknown as T));

const buildFeatureMock = () => ({
  createSettings: { execute: createAsyncMock<any>() },
  listSettings: { execute: createAsyncMock<any>() },
  getSettings: { execute: createAsyncMock<any>() },
  updateSettings: { execute: createAsyncMock<any>() },
  deleteSettings: { execute: createAsyncMock<void>() },
  updateGoalAchievement: { execute: createAsyncMock<any>() },
  updateDisplayOptions: { execute: createAsyncMock<any>() },
});
type FeatureMock = ReturnType<typeof buildFeatureMock>;

describe("MetricSettings HTTP controller", () => {
  let feature: FeatureMock;
  let controller: ReturnType<typeof createMetricSettingsController>;
  const res = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();
    feature = buildFeatureMock();
    controller = createMetricSettingsController(feature as any);
  });

  const makeAuthReq = (overrides: Partial<AuthRequest> = {}): AuthRequest => {
    return {
      user: { id: "user-1", organizationId: "org-1" } as any,
      organizationId: "org-1",
      membership: {
        id: "mem-1",
        role: "owner",
        organizationId: "org-1",
        userId: "user-1",
      },
      ...overrides,
    } as AuthRequest;
  };

  it("creates metric settings with feature payload", async () => {
    const payload = {
      metricId: "metric-1",
      goalEnabled: false,
    };
    const entity = buildMetricSettings({ id: "settings-1" });
    feature.createSettings.execute.mockResolvedValue(entity);
    pickValidatedMock.mockReturnValueOnce(() => ({ body: payload }));
    const req = makeAuthReq({ body: payload });

    await controller.createMetricSettings(req, res, jest.fn());

    expect(feature.createSettings.execute).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      ...payload,
    });
    expect(successResponseMock).toHaveBeenCalledWith(
      res,
      201,
      expect.objectContaining({ id: entity.id }),
      "Metric settings created successfully",
    );
  });

  it("lists metric settings via cursor", async () => {
    const entity = buildMetricSettings({ id: "settings-2" });
    feature.listSettings.execute.mockResolvedValue({
      items: [entity],
      sort: "-createdAt" as const,
      limit: 10,
    });
    pickValidatedMock.mockReturnValueOnce(() => ({
      query: { limit: 10, sort: "-createdAt" as const },
    }));

    await controller.getAllMetricSettingsViaCursor(
      makeAuthReq(),
      res,
      jest.fn(),
    );

    expect(feature.listSettings.execute).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      limit: 10,
      sort: "-createdAt",
    });
    expect(successResponseMock).toHaveBeenCalledWith(
      res,
      200,
      expect.objectContaining({
        limit: 10,
        items: [expect.objectContaining({ id: entity.id })],
      }),
      "Metric settings fetched successfully",
    );
  });

  it("gets settings by id", async () => {
    const entity = buildMetricSettings({ id: "settings-3" });
    feature.getSettings.execute.mockResolvedValue(entity);
    pickValidatedMock.mockReturnValueOnce(() => ({
      params: { id: "settings-3" },
    }));

    await controller.getMetricSettingsById(makeAuthReq(), res, jest.fn());

    expect(feature.getSettings.execute).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "settings-3",
    );
    expect(successResponseMock).toHaveBeenCalledWith(
      res,
      200,
      expect.objectContaining({ id: entity.id }),
    );
  });

  it("updates metric settings", async () => {
    const entity = buildMetricSettings({ id: "settings-4" });
    feature.updateSettings.execute.mockResolvedValue(entity);
    const body = {
      goalEnabled: true,
      goalType: "cumulative" as const,
      goalValue: 10,
    };
    pickValidatedMock.mockReturnValueOnce(() => ({
      params: { id: "settings-4" },
      body,
    }));

    await controller.updateMetricSettings(makeAuthReq(), res, jest.fn());

    expect(feature.updateSettings.execute).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "settings-4",
      body,
    );
    expect(successResponseMock).toHaveBeenCalledWith(
      res,
      200,
      expect.objectContaining({ id: entity.id }),
      "Metric settings updated successfully",
    );
  });

  it("deletes metric settings", async () => {
    feature.deleteSettings.execute.mockResolvedValue(undefined);
    pickValidatedMock.mockReturnValueOnce(() => ({
      params: { id: "settings-5" },
    }));

    await controller.deleteMetricSettings(makeAuthReq(), res, jest.fn());

    expect(feature.deleteSettings.execute).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "settings-5",
    );
    expect(successResponseMock).toHaveBeenCalledWith(
      res,
      200,
      null,
      "Metric settings deleted successfully",
    );
  });

  it("updates goal achievement", async () => {
    const entity = buildMetricSettings({ id: "settings-6" });
    feature.updateGoalAchievement.execute.mockResolvedValue(entity);
    pickValidatedMock.mockReturnValueOnce(() => ({
      params: { id: "settings-6" },
    }));

    await controller.updateGoalAchievement(makeAuthReq(), res, jest.fn());

    expect(feature.updateGoalAchievement.execute).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "settings-6",
    );
    expect(successResponseMock).toHaveBeenCalledWith(
      res,
      200,
      expect.objectContaining({ id: entity.id }),
      "Goal marked as achieved",
    );
  });

  it("updates display options", async () => {
    const entity = buildMetricSettings({
      id: "settings-7",
      displayOptions: {
        showOnDashboard: false,
        priority: 5,
        chartType: "bar",
        color: "#000000",
      },
    });
    feature.updateDisplayOptions.execute.mockResolvedValue(entity);
    const displayOptions = {
      showOnDashboard: false,
      priority: 5,
      chartType: "bar",
      color: "#000000",
    };
    pickValidatedMock.mockReturnValueOnce(() => ({
      params: { id: "settings-7" },
      body: { displayOptions },
    }));

    await controller.updateDisplayOptions(makeAuthReq(), res, jest.fn());

    expect(feature.updateDisplayOptions.execute).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "settings-7",
      displayOptions,
    );
    expect(successResponseMock).toHaveBeenCalledWith(
      res,
      200,
      displayOptions,
      "Display options updated",
    );
  });

  it("bubbles authentication errors via next()", async () => {
    pickValidatedMock.mockReturnValueOnce(() => ({ body: {} }));
    const next = jest.fn();
    await controller.createMetricSettings({} as AuthRequest, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });
});
