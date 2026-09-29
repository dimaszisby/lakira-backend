import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import AppError from "@/utils/AppError.js";
import { GetMetricTrend } from "@/features/analytics/application/queries/GetMetricTrend.js";
import type { MetricAccessPort } from "@/features/public/analytics/application/ports/MetricAccessPort.js";
import type {
  TrendRepository,
  TrendPoint,
} from "@/features/analytics/application/ports/TrendRepository.js";

const TREND_POINTS: TrendPoint[] = [
  { date: new Date("2025-04-01"), value: 5 },
  { date: new Date("2025-04-02"), value: 8 },
];

function build() {
  const metricAccess: jest.Mocked<MetricAccessPort> = {
    ensureMetricOwnership: jest.fn<(...args: any[]) => Promise<void>>(),
  };
  const trendRepo: jest.Mocked<TrendRepository> = {
    findTrendPoints: jest
      .fn<(...args: any[]) => Promise<TrendPoint[]>>()
      .mockResolvedValue(TREND_POINTS),
  };
  const sut = new GetMetricTrend(metricAccess, trendRepo);
  return { sut, metricAccess, trendRepo };
}

const BASE = {
  userId: "user-1",
  organizationId: "org-1",
  metricId: "metric-1",
};

describe("GetMetricTrend", () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
  });

  it("throws 401 when userId is missing", async () => {
    await expect(
      ctx.sut.execute({ ...BASE, userId: "" }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(ctx.metricAccess.ensureMetricOwnership).not.toHaveBeenCalled();
  });

  it("throws 400 when metricId is missing", async () => {
    await expect(
      ctx.sut.execute({ ...BASE, metricId: "" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(ctx.metricAccess.ensureMetricOwnership).not.toHaveBeenCalled();
  });

  it("propagates ownership check failure without calling trendRepo", async () => {
    ctx.metricAccess.ensureMetricOwnership.mockRejectedValue(
      new AppError("Forbidden", 403),
    );

    await expect(ctx.sut.execute(BASE)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(ctx.trendRepo.findTrendPoints).not.toHaveBeenCalled();
  });

  it("calls findTrendPoints with correct criteria and returns trend points", async () => {
    const before = new Date();
    const result = await ctx.sut.execute(BASE);
    const after = new Date();

    expect(ctx.metricAccess.ensureMetricOwnership).toHaveBeenCalledWith(
      BASE.userId,
      BASE.organizationId,
      BASE.metricId,
    );

    const call = ctx.trendRepo.findTrendPoints.mock.calls[0][0] as any;
    expect(call.metricId).toBe(BASE.metricId);
    expect(call.organizationId).toBe(BASE.organizationId);
    // since should be ~30 days ago
    const expectedSince = new Date(before);
    expectedSince.setDate(expectedSince.getDate() - 30);
    expect(call.since.getTime()).toBeGreaterThanOrEqual(
      expectedSince.getTime() - 1000,
    );
    expect(call.since.getTime()).toBeLessThanOrEqual(after.getTime());

    expect(result).toBe(TREND_POINTS);
  });

  it("respects a custom days parameter when computing since", async () => {
    const before = new Date();
    await ctx.sut.execute({ ...BASE, days: 7 });
    const after = new Date();

    const call = ctx.trendRepo.findTrendPoints.mock.calls[0][0] as any;
    const expectedSince = new Date(before);
    expectedSince.setDate(expectedSince.getDate() - 7);
    expect(call.since.getTime()).toBeGreaterThanOrEqual(
      expectedSince.getTime() - 1000,
    );
    expect(call.since.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
