import { jest } from "@jest/globals";
import { createMetricSettingsRouter } from "@/features/metric-settings/infrastructure/http/router.js";
import * as controllerModule from "@/features/metric-settings/infrastructure/http/controller.js";
import { metricSettingsCursorCacheKey } from "@/features/metric-settings/infrastructure/http/cache-keys.js";

type RouterDouble = {
  use: jest.Mock;
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
  patch: jest.Mock;
  all: jest.Mock;
};

function makeRouterDouble(): RouterDouble {
  return {
    use: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    all: jest.fn(),
  };
}

jest.mock("express", () => ({
  Router: jest.fn(() => makeRouterDouble()),
}));

const { Router: RouterMock } = jest.requireMock("express") as {
  Router: jest.MockedFunction<() => RouterDouble>;
};

jest.mock("@/features/auth/infrastructure/http/authMiddleware.js", () => ({
  authMiddleware: jest.fn(),
}));

jest.mock("@/shared/middleware/rate-limiter.js", () => ({
  userRateLimiter: jest.fn(),
}));

const validateResult = (schema: string) => ({ schema, type: "validate" });
jest.mock("@/shared/middleware/validation.js", () => ({
  validate: jest.fn(),
}));

const cacheResult = (name: string, ttl: number) => ({ name, ttl });
jest.mock("@/shared/middleware/cache.js", () => ({
  cacheMiddleware: jest.fn(),
}));

jest.mock("@/shared/cache/keys.js", () => ({
  buildCursorCacheKey: jest.fn(() => "cursor-key"),
}));

jest.mock("@/utils/logger.js", () => ({
  debug: jest.fn(),
}));

jest.mock(
  "@/features/metric-settings/infrastructure/http/controller.js",
  () => ({
    createMetricSettings: jest.fn(),
    getMetricSettingsById: jest.fn(),
    updateMetricSettings: jest.fn(),
    deleteMetricSettings: jest.fn(),
    updateGoalAchievement: jest.fn(),
    updateDisplayOptions: jest.fn(),
    getAllMetricSettingsViaCursor: jest.fn(),
  }),
);

jest.mock(
  "@/features/metric-settings/infrastructure/http/schema.zod.js",
  () => ({
    createMetricSettingsSchema: "createSchema",
    updateMetricSettingsSchema: "updateSchema",
    getMetricSettingsSchema: "getSchema",
    deleteMetricSettingsSchema: "deleteSchema",
    listMetricSettingsViaCursorSchema: "listSchema",
    updateDisplayOptionsSchema: "displaySchema",
    goalAchievementSchema: "goalSchema",
  }),
);

const controllerMocks = controllerModule as jest.Mocked<
  typeof controllerModule
>;

const {
  createMetricSettings: createMetricSettingsMock,
  getMetricSettingsById: getMetricSettingsByIdMock,
  updateMetricSettings: updateMetricSettingsMock,
  deleteMetricSettings: deleteMetricSettingsMock,
  updateGoalAchievement: updateGoalAchievementMock,
  updateDisplayOptions: updateDisplayOptionsMock,
  getAllMetricSettingsViaCursor: getAllMetricSettingsViaCursorMock,
} = controllerMocks;

const { authMiddleware: authMiddlewareMock } = jest.requireMock(
  "@/features/auth/infrastructure/http/authMiddleware.js",
) as {
  authMiddleware: jest.MockedFunction<(req: any, res: any, next: any) => any>;
};

const { userRateLimiter: userRateLimiterMock } = jest.requireMock(
  "@/shared/middleware/rate-limiter.js",
) as {
  userRateLimiter: jest.MockedFunction<(req: any, res: any, next: any) => any>;
};

const { validate: validateMock } = jest.requireMock(
  "@/shared/middleware/validation.js",
) as { validate: jest.MockedFunction<(schema: string) => any> };
validateMock.mockImplementation((schema: string) => validateResult(schema));

const { cacheMiddleware: cacheMiddlewareMock } = jest.requireMock(
  "@/shared/middleware/cache.js",
) as {
  cacheMiddleware: jest.MockedFunction<
    (
      builder: (req: any) => string,
      ttl: number,
      options?: { disableInTest?: boolean },
    ) => any
  >;
};
cacheMiddlewareMock.mockImplementation(
  (builder: (req: any) => string, ttl: number) => ({
    builder,
    ttl,
  }),
);

const { buildCursorCacheKey: buildCursorCacheKeyMock } = jest.requireMock(
  "@/shared/cache/keys.js",
) as { buildCursorCacheKey: jest.MockedFunction<(args: any) => string> };

const { debug: loggerDebugMock } = jest.requireMock("@/utils/logger.js") as {
  debug: jest.MockedFunction<(message: string, meta?: any) => void>;
};

const getLastRouterInstance = (): RouterDouble => {
  const result = RouterMock.mock.results[RouterMock.mock.results.length - 1];
  if (!result || result.type !== "return" || !result.value) {
    throw new Error("Router was not instantiated");
  }
  return result.value;
};

describe("metric settings router", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const buildRouter = () => {
    createMetricSettingsRouter();
    return getLastRouterInstance();
  };

  it("attaches auth middleware and wires GET routes with validation + cache layers", () => {
    const router = buildRouter();

    expect(router.use).toHaveBeenCalledWith(authMiddlewareMock);

    const [
      listValidator,
      getValidator,
      createValidator,
      updateValidator,
      deleteValidator,
      goalValidator,
      displayValidator,
    ] = validateMock.mock.results.map((r) => r.value);

    const [listCache, detailCache] = cacheMiddlewareMock.mock.results.map(
      (r) => r.value,
    );

    expect(router.get).toHaveBeenNthCalledWith(
      1,
      "/",
      listValidator,
      listCache,
      getAllMetricSettingsViaCursorMock,
    );

    expect(router.get).toHaveBeenNthCalledWith(
      2,
      "/:id",
      getValidator,
      detailCache,
      getMetricSettingsByIdMock,
    );

    expect(router.post).toHaveBeenCalledWith(
      "/",
      userRateLimiterMock,
      expect.anything(),
      createValidator,
      createMetricSettingsMock,
    );

    expect(router.put).toHaveBeenCalledWith(
      "/:id",
      userRateLimiterMock,
      expect.anything(),
      updateValidator,
      updateMetricSettingsMock,
    );

    expect(router.delete).toHaveBeenCalledWith(
      "/:id",
      userRateLimiterMock,
      deleteValidator,
      deleteMetricSettingsMock,
    );

    expect(router.patch).toHaveBeenNthCalledWith(
      1,
      "/:id/achieve",
      userRateLimiterMock,
      goalValidator,
      updateGoalAchievementMock,
    );

    expect(router.patch).toHaveBeenNthCalledWith(
      2,
      "/:id/display",
      userRateLimiterMock,
      expect.anything(),
      displayValidator,
      updateDisplayOptionsMock,
    );
  });

  // Key building is tested against the real schema in cache-keys.test.ts (kit
  // list-cache-key-filters, D-04); this only checks the list route uses it.
  it("caches the list route under metricSettingsCursorCacheKey", () => {
    buildRouter();

    expect(cacheMiddlewareMock.mock.calls[0]).toEqual([
      metricSettingsCursorCacheKey,
      300,
    ]);
  });

  it("builds cache keys for detail routes using user + metricSetting ids", () => {
    buildRouter();
    const detailKeyFn = cacheMiddlewareMock.mock.calls[1][0] as (
      req: any,
    ) => string;

    const req: any = {
      user: { id: "user-A", organizationId: "org-A" },
      params: { id: "settings-9" },
    };

    const key = detailKeyFn(req);
    expect(key).toBe("metricSetting:org-A:user-A:settings-9");
  });
});
