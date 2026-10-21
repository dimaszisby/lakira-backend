import { jest } from "@jest/globals";
import {
  metricLogCacheKey,
  metricLogStatsCacheKey,
  metricLogsCursorCacheKey,
} from "@/features/metric-log/infrastructure/http/cache-keys.js";
import { createMetricLogRouter } from "@/features/metric-log/infrastructure/http/router.js";

type RouterDouble = {
  use: jest.Mock;
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
  patch: jest.Mock;
  all: jest.Mock;
  route: jest.Mock;
};

type RouteDouble = {
  get: jest.Mock;
  all: jest.Mock;
};

function makeRouteDouble(): RouteDouble {
  const route = {} as RouteDouble;
  route.get = jest.fn().mockReturnValue(route);
  route.all = jest.fn().mockReturnValue(route);
  return route;
}

function makeRouterDouble(): RouterDouble {
  const routeDouble = makeRouteDouble();
  return {
    use: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    all: jest.fn(),
    route: jest.fn(() => routeDouble),
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
  buildCursorCacheKey: jest.fn(() => "metric-log-cursor-key"),
}));

jest.mock("@/utils/logger.js", () => ({
  debug: jest.fn(),
}));

jest.mock("@/features/metric-log/infrastructure/http/controller.js", () => {
  // One set of handler mocks, returned by every call of the factory (ADR-0072).
  const handlers = {
    createMetricLog: jest.fn(),
    getLogById: jest.fn(),
    updateLog: jest.fn(),
    deleteLog: jest.fn(),
    getAggregatedStats: jest.fn(),
    generateDummyMetricLogs: jest.fn(),
    getUserLogLibrariesViaCursor: jest.fn(),
  };
  return { createMetricLogController: jest.fn(() => handlers), handlers };
});

jest.mock("@/features/metric-log/infrastructure/http/schema.zod.js", () => ({
  createMetricLogSchema: "createMetricLogSchema",
  updateMetricLogSchema: "updateMetricLogSchema",
  getMetricLogByIdSchema: "getMetricLogByIdSchema",
  deleteMetricLogSchema: "deleteMetricLogSchema",
  getAggregatedStatsSchema: "getAggregatedStatsSchema",
  generateDummyMetricLogsSchema: "generateDummyMetricLogsSchema",
  listMetricLogsViaCursorSchema: "listMetricLogsViaCursorSchema",
}));

const controllerMocks = (
  jest.requireMock(
    "@/features/metric-log/infrastructure/http/controller.js",
  ) as {
    handlers: Record<string, jest.Mock>;
  }
).handlers;

const {
  createMetricLog: createMetricLogMock,
  getLogById: getLogByIdMock,
  updateLog: updateLogMock,
  deleteLog: deleteLogMock,
  getAggregatedStats: getAggregatedStatsMock,
  generateDummyMetricLogs: generateDummyMetricLogsMock,
  getUserLogLibrariesViaCursor: listLogsMock,
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

const getLastRouterInstance = (): RouterDouble => {
  const result = RouterMock.mock.results[RouterMock.mock.results.length - 1];
  if (!result || result.type !== "return" || !result.value) {
    throw new Error("Router was not instantiated");
  }
  return result.value;
};

describe("metric log router", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    envMock.ENABLE_DUMMY_ENDPOINTS = true;
  });

  const buildRouter = () => {
    createMetricLogRouter({} as any);
    return getLastRouterInstance();
  };

  it("wires middleware and handlers for each route", () => {
    const router = buildRouter();

    expect(router.use).toHaveBeenCalledWith(authMiddlewareMock);

    const [
      listValidator,
      statsValidator,
      getValidator,
      createValidator,
      updateValidator,
      deleteValidator,
      dummyValidator,
    ] = validateMock.mock.results.map((r) => r.value);

    const [cursorCache, statsCache, detailCache] =
      cacheMiddlewareMock.mock.results.map((r) => r.value);

    expect(router.get).toHaveBeenNthCalledWith(
      1,
      "/",
      listValidator,
      cursorCache,
      listLogsMock,
    );
    expect(cursorCache.ttl).toBe(300);

    const statsRoute = router.route.mock.results[0]?.value as
      | RouteDouble
      | undefined;
    expect(router.route).toHaveBeenCalledWith("/stats");
    expect(statsRoute?.get).toHaveBeenCalledWith(
      statsValidator,
      statsCache,
      getAggregatedStatsMock,
    );
    expect(statsRoute?.all).toHaveBeenCalledWith(expect.any(Function));
    expect(statsCache.ttl).toBe(300);

    expect(router.get).toHaveBeenNthCalledWith(
      2,
      "/:id",
      getValidator,
      detailCache,
      getLogByIdMock,
    );
    expect(detailCache.ttl).toBe(300);

    expect(router.post).toHaveBeenNthCalledWith(
      1,
      "/",
      userRateLimiterMock,
      expect.anything(),
      createValidator,
      createMetricLogMock,
    );

    expect(router.put).toHaveBeenCalledWith(
      "/:id",
      userRateLimiterMock,
      expect.anything(),
      updateValidator,
      updateLogMock,
    );

    expect(router.delete).toHaveBeenCalledWith(
      "/:id",
      userRateLimiterMock,
      deleteValidator,
      deleteLogMock,
    );

    expect(router.post).toHaveBeenNthCalledWith(
      2,
      "/:metricId/dummy",
      userRateLimiterMock,
      expect.anything(),
      dummyValidator,
      generateDummyMetricLogsMock,
    );
  });

  it("skips dummy endpoint when feature flag disabled", () => {
    envMock.ENABLE_DUMMY_ENDPOINTS = false;
    const router = buildRouter();

    expect(router.post).toHaveBeenCalledTimes(1);
    expect(router.post).toHaveBeenCalledWith(
      "/",
      userRateLimiterMock,
      expect.any(Function),
      expect.anything(),
      createMetricLogMock,
    );
  });

  // Both keys moved to cache-keys.ts and are tested there against the real schema
  // (query-values-mean-what-they-say D-04, D-05); this checks each route uses its builder.
  it("caches the list route under metricLogsCursorCacheKey", () => {
    buildRouter();
    expect(cacheMiddlewareMock.mock.calls[0]).toEqual([
      metricLogsCursorCacheKey,
      300,
    ]);
  });

  it("caches the single-log route under metricLogCacheKey", () => {
    buildRouter();
    expect(cacheMiddlewareMock.mock.calls[2]).toEqual([metricLogCacheKey, 300]);
  });

  it("caches the stats route under metricLogStatsCacheKey", () => {
    buildRouter();
    expect(cacheMiddlewareMock.mock.calls[1]).toEqual([
      metricLogStatsCacheKey,
      300,
    ]);
  });
});
