import { jest } from "@jest/globals";
import { createMetricRouter } from "@/features/metric/infrastructure/http/router.js";
import * as controllerModule from "@/features/metric/infrastructure/http/controller.js";
import { metricsCursorCacheKey } from "@/features/metric/infrastructure/http/cache-keys.js";

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

jest.mock("@/config/envManager.js", () => ({
  env: { ENABLE_DUMMY_ENDPOINTS: true },
}));

const { env: envMock } = jest.requireMock("@/config/envManager.js") as {
  env: { ENABLE_DUMMY_ENDPOINTS: boolean };
};

jest.mock("@/features/auth/infrastructure/http/authMiddleware.js", () => ({
  authMiddleware: jest.fn(),
}));

jest.mock("@/shared/middleware/rate-limiter.js", () => ({
  userRateLimiter: jest.fn(),
}));

const validateResult = (schema: unknown) => ({ schema, type: "validate" });
jest.mock("@/shared/middleware/validation.js", () => ({
  validate: jest.fn(),
}));

jest.mock("@/shared/middleware/cache.js", () => ({
  cacheMiddleware: jest.fn(),
}));

jest.mock("@/shared/cache/keys.js", () => ({
  buildCursorCacheKey: jest.fn(() => "metrics-cursor-key"),
}));

jest.mock("@/features/metric/infrastructure/http/controller.js", () => ({
  createMetric: jest.fn(),
  getUserMetricLibrariesViaCursor: jest.fn(),
  getUserDetailMetricById: jest.fn(),
  updateMetric: jest.fn(),
  deleteMetric: jest.fn(),
  generateDummyMetrics: jest.fn(),
  handleMetricTrend: jest.fn(),
}));

jest.mock("@/features/metric/infrastructure/http/schema.zod.js", () => ({
  createMetricSchema: "createMetricSchema",
  updateMetricSchema: "updateMetricSchema",
  deleteMetricSchema: "deleteMetricSchema",
  getMetricSchema: "getMetricSchema",
  generateDummyMetricsSchema: "generateDummyMetricsSchema",
  getAllMetricsViaCursorSchema: "getAllMetricsViaCursorSchema",
}));

const controllerMocks = controllerModule as jest.Mocked<
  typeof controllerModule
>;

const {
  createMetric: createMetricMock,
  getUserMetricLibrariesViaCursor: listMetricsMock,
  getUserDetailMetricById: getMetricMock,
  updateMetric: updateMetricMock,
  deleteMetric: deleteMetricMock,
  generateDummyMetrics: generateDummyMetricsMock,
  handleMetricTrend: handleMetricTrendMock,
} = controllerMocks;

const { authMiddleware: authMiddlewareMock } = jest.requireMock(
  "@/features/auth/infrastructure/http/authMiddleware.js",
) as { authMiddleware: jest.Mock };

const { userRateLimiter: userRateLimiterMock } = jest.requireMock(
  "@/shared/middleware/rate-limiter.js",
) as { userRateLimiter: jest.Mock };

const { validate: validateMock } = jest.requireMock(
  "@/shared/middleware/validation.js",
) as { validate: jest.MockedFunction<(schema: unknown) => any> };
validateMock.mockImplementation((schema: unknown) => validateResult(schema));

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

const getLastRouterInstance = (): RouterDouble => {
  const result = RouterMock.mock.results[RouterMock.mock.results.length - 1];
  if (!result || result.type !== "return" || !result.value) {
    throw new Error("Router was not instantiated");
  }
  return result.value;
};

describe("metric router", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    envMock.ENABLE_DUMMY_ENDPOINTS = true;
  });

  const buildRouter = () => {
    createMetricRouter();
    return getLastRouterInstance();
  };

  it("wires middleware and handlers for all routes", () => {
    const router = buildRouter();

    expect(router.use).toHaveBeenCalledWith(authMiddlewareMock);

    const [
      createValidator,
      listValidator,
      getValidator,
      updateValidator,
      deleteValidator,
      trendValidator,
      dummyValidator,
    ] = validateMock.mock.results.map((r) => r.value);

    const [listCache, detailCache] = cacheMiddlewareMock.mock.results.map(
      (r) => r.value,
    );

    expect(router.post).toHaveBeenNthCalledWith(
      1,
      "/",
      userRateLimiterMock,
      expect.anything(),
      createValidator,
      createMetricMock,
    );

    expect(router.get).toHaveBeenNthCalledWith(
      1,
      "/",
      listValidator,
      listCache,
      listMetricsMock,
    );

    expect(listCache.ttl).toBe(60);

    expect(router.get).toHaveBeenNthCalledWith(
      2,
      "/:id",
      getValidator,
      detailCache,
      getMetricMock,
    );
    expect(detailCache.ttl).toBe(60);

    expect(router.put).toHaveBeenCalledWith(
      "/:id",
      userRateLimiterMock,
      expect.anything(),
      updateValidator,
      updateMetricMock,
    );

    expect(router.delete).toHaveBeenCalledWith(
      "/:id",
      userRateLimiterMock,
      deleteValidator,
      deleteMetricMock,
    );

    expect(router.get).toHaveBeenNthCalledWith(
      3,
      "/:metricId/trends",
      trendValidator,
      handleMetricTrendMock,
    );

    expect(router.post).toHaveBeenNthCalledWith(
      2,
      "/dummy",
      userRateLimiterMock,
      expect.anything(),
      dummyValidator,
      generateDummyMetricsMock,
    );
  });

  it("omits dummy endpoint when feature flag disabled", () => {
    envMock.ENABLE_DUMMY_ENDPOINTS = false;
    const router = buildRouter();

    expect(router.post).toHaveBeenCalledTimes(1);
    expect(router.post).toHaveBeenCalledWith(
      "/",
      userRateLimiterMock,
      expect.any(Function),
      expect.anything(),
      createMetricMock,
    );
  });

  // This used to call the key builder with a flat "filter[name]" query key,
  // which Express never produces, so it passed while every filter shared one
  // cache entry (audit R2). Key building is now tested against the real schema
  // in cache-keys.test.ts; this only checks the list route uses that builder.
  it("caches the list route under metricsCursorCacheKey", () => {
    buildRouter();

    expect(cacheMiddlewareMock.mock.calls[0]).toEqual([
      metricsCursorCacheKey,
      60,
    ]);
  });

  it("builds resource cache keys with normalized include query", () => {
    buildRouter();
    const detailBuilder = cacheMiddlewareMock.mock.calls[1][0] as (
      req: any,
    ) => string;

    const req: any = {
      user: { id: "user-1", organizationId: "org-1" },
      params: { id: "metric-1" },
      query: { include: "logs,settings,unknown", logsLimit: "15" },
    };

    expect(detailBuilder(req)).toBe(
      "metric:org-1:user-1:metric-1:inc:logs,settings:ll:15",
    );
  });
});
