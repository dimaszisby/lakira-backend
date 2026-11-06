import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { AnalyticsVisualizationInvalidationAdapter } from "@/features/analytics/infrastructure/cache/VisualizationInvalidationAdapter.js";

jest.mock("@/utils/redis-client.js", () => ({
  redisClient: { isOpen: true },
  invalidateCacheByPattern: jest.fn(async () => undefined),
}));

const { redisClient, invalidateCacheByPattern } = jest.requireMock(
  "@/utils/redis-client.js",
) as {
  redisClient: { isOpen: boolean };
  invalidateCacheByPattern: jest.MockedFunction<
    (pattern: string) => Promise<void>
  >;
};

const adapter = new AnalyticsVisualizationInvalidationAdapter();

describe("AnalyticsVisualizationInvalidationAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.isOpen = true;
    invalidateCacheByPattern.mockResolvedValue(undefined);
  });

  it("skips invalidation when redis is not open", async () => {
    redisClient.isOpen = false;

    await adapter.invalidateByMetric("user-1", "org-1", "metric-9");

    expect(invalidateCacheByPattern).not.toHaveBeenCalled();
  });

  // It walked with its own loop, deleting one key per round trip (#240).
  it("deletes the metric's charts and the user's dashboards", async () => {
    await adapter.invalidateByMetric("user-1", "org-1", "metric-9");

    expect(invalidateCacheByPattern).toHaveBeenCalledTimes(2);
    expect(invalidateCacheByPattern).toHaveBeenCalledWith(
      "viz:org-1:user-1:metric-9:*",
    );
    expect(invalidateCacheByPattern).toHaveBeenCalledWith(
      "vizdash:org-1:user-1:*",
    );
  });

  it("starts both walks before either finishes", async () => {
    let finish: () => void = () => {};
    invalidateCacheByPattern.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );

    const done = adapter.invalidateByMetric("user-1", "org-1", "metric-9");
    await Promise.resolve();

    expect(invalidateCacheByPattern).toHaveBeenCalledTimes(2);
    finish();
    await done;
  });
});
