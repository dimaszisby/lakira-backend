import { jest } from "@jest/globals";
import AppError from "@/utils/AppError.js";
import { GetMetricDetail } from "@/features/metric/application/queries/GetMetricDetail.js";
import type { MetricDomainExtended } from "@/features/metric/domain/metric.domain.js";

const TEST_ORG_ID = "org-test-id";

const sampleMetric: MetricDomainExtended = {
  id: "metric-1",
  userId: "owner-1",
  categoryId: null,
  originalMetricId: null,
  name: "Steps",
  defaultUnit: "steps",
  description: "desc",
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  logs: [],
  settings: null,
  category: null,
};

describe("GetMetricDetail query", () => {
  it("returns null when repo misses metric", async () => {
    const repo = {
      findDetailedMetric: jest
        .fn<(...args: any[]) => Promise<MetricDomainExtended | null>>()
        .mockResolvedValue(null),
    } as any;
    const query = new GetMetricDetail(repo);

    const result = await query.execute({
      userId: "user-1",
      organizationId: TEST_ORG_ID,
      metricId: "missing",
    });

    expect(result).toBeNull();
    expect(repo.findDetailedMetric).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: TEST_ORG_ID,
      metricId: "missing",
      includes: [],
      logsLimit: 20,
    });
  });

  it("throws when accessing another user's private metric", async () => {
    const repo = {
      findDetailedMetric: jest
        .fn<(...args: any[]) => Promise<MetricDomainExtended | null>>()
        .mockResolvedValue(sampleMetric),
    } as any;
    const query = new GetMetricDetail(repo);

    await expect(
      query.execute({
        userId: "intruder",
        organizationId: TEST_ORG_ID,
        metricId: "metric-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("returns metric when authorized", async () => {
    const repo = {
      findDetailedMetric: jest
        .fn<(...args: any[]) => Promise<MetricDomainExtended | null>>()
        .mockResolvedValue(sampleMetric),
    } as any;
    const query = new GetMetricDetail(repo);

    const output = await query.execute({
      userId: "owner-1",
      organizationId: TEST_ORG_ID,
      metricId: "metric-1",
      includes: ["logs", "category"],
      logsLimit: 5,
    });

    expect(repo.findDetailedMetric).toHaveBeenCalledWith({
      userId: "owner-1",
      organizationId: TEST_ORG_ID,
      metricId: "metric-1",
      includes: ["logs", "category"],
      logsLimit: 5,
    });
    expect(output).toBe(sampleMetric);
  });
});
