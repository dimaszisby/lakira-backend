import { jest } from "@jest/globals";

type RouterDouble = {
  use: jest.Mock;
  get: jest.Mock;
  all: jest.Mock;
};

const makeRouterDouble = (): RouterDouble => ({
  use: jest.fn(),
  get: jest.fn(),
  all: jest.fn(),
});

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
  analyticsRateLimiter: jest.fn(),
}));

const validateResult = (schema: unknown) => ({ schema, type: "validate" });
jest.mock("@/shared/middleware/validation.js", () => ({
  validate: jest.fn(),
}));

const catchAsyncWrap = jest.fn((handler: any) => ({ wrapped: handler }));
jest.mock("@/utils/catch-async.js", () => ({
  __esModule: true,
  default: jest.fn((handler: any) => catchAsyncWrap(handler)),
}));

jest.mock("@/features/analytics/infrastructure/http/controller.js", () => {
  // One set of handler mocks, returned by every call of the factory (ADR-0072).
  const handlers = {
    handleGetDashboardVisualization: jest.fn(),
    handleGetVisualization: jest.fn(),
  };
  return { createAnalyticsController: jest.fn(() => handlers), handlers };
});

jest.mock("@/features/analytics/infrastructure/http/schema.zod.js", () => ({
  getDashboardVizSchema: "getDashboardVizSchema",
  getVisualizationSchema: "getVisualizationSchema",
}));

const { authMiddleware: authMiddlewareMock } = jest.requireMock(
  "@/features/auth/infrastructure/http/authMiddleware.js",
) as { authMiddleware: jest.Mock };

const { analyticsRateLimiter: analyticsRateLimiterMock } = jest.requireMock(
  "@/shared/middleware/rate-limiter.js",
) as { analyticsRateLimiter: jest.Mock };

const { validate: validateMock } = jest.requireMock(
  "@/shared/middleware/validation.js",
) as { validate: jest.MockedFunction<(schema: unknown) => any> };
validateMock.mockImplementation((schema: unknown) => validateResult(schema));

const {
  handleGetDashboardVisualization: handleDashboardMock,
  handleGetVisualization: handleVisualizationMock,
} = (
  jest.requireMock(
    "@/features/analytics/infrastructure/http/controller.js",
  ) as {
    handlers: {
      handleGetDashboardVisualization: jest.Mock;
      handleGetVisualization: jest.Mock;
    };
  }
).handlers;

const catchAsyncModule = jest.requireMock("@/utils/catch-async.js") as {
  default: jest.Mock;
};
const catchAsyncMock = catchAsyncModule.default;

const instantiateRouter = (): RouterDouble => {
  jest.isolateModules(() => {
    // The module constructs nothing on import (ADR-0045); build the router explicitly.
    const { createVisualizationRouter } =
      require("@/features/analytics/infrastructure/http/router.js") as {
        createVisualizationRouter: (feature: unknown) => unknown;
      };
    createVisualizationRouter({});
  });
  const result = RouterMock.mock.results[RouterMock.mock.results.length - 1];
  if (!result || result.type !== "return" || !result.value) {
    throw new Error("Router was not instantiated");
  }
  return result.value;
};

describe("analytics visualization router", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RouterMock.mockClear();
  });

  it("registers routes with auth, rate limiter, validation, and async handlers", () => {
    const router = instantiateRouter();

    expect(router.use).toHaveBeenCalledWith(authMiddlewareMock);

    const [dashboardValidator, detailValidator] = validateMock.mock.results.map(
      (r) => r.value,
    );

    expect(router.get).toHaveBeenNthCalledWith(
      1,
      "/dashboard",
      analyticsRateLimiterMock,
      dashboardValidator,
      expect.objectContaining({ wrapped: handleDashboardMock }),
    );

    expect(router.get).toHaveBeenNthCalledWith(
      2,
      "/metrics/:metricId",
      analyticsRateLimiterMock,
      detailValidator,
      expect.objectContaining({ wrapped: handleVisualizationMock }),
    );

    expect(catchAsyncMock).toHaveBeenCalledWith(handleDashboardMock);
    expect(catchAsyncMock).toHaveBeenCalledWith(handleVisualizationMock);
  });
});
