import { jest } from "@jest/globals";
import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import { GetDashboardVisualization } from "@/features/analytics/application/queries/GetDashboardVisualization.js";
import type { VisualizationReadRepository } from "@/features/analytics/application/ports/VisualizationReadRepository.js";

const makeRepo = () => {
  const repo = {
    fetchVisualization: jest.fn<(...args: any[]) => Promise<any>>(),
    fetchDashboardVisualization: jest
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue({
        items: [],
        meta: {
          bucket: "1d",
          tz: "UTC",
          range: {
            startISO: "2024-01-01T00:00:00.000Z",
            endISO: "2024-01-05T00:00:00.000Z",
          },
          count: 0,
          totalMetrics: 0,
          fallbackMetrics: 0,
        },
        sync: { etagSeed: "seed" },
      }),
  } as const;
  return repo as unknown as VisualizationReadRepository;
};

// Kit v6-small-items, D-04: the limits are handed in, not read from env.
const LIMITS = { maxBuckets: 400, maxDashboardMetrics: 24 };

describe("GetDashboardVisualization query", () => {
  const TEST_ORG_ID = "org-test-id";

  const baseInput = {
    userId: "user-1",
    organizationId: TEST_ORG_ID,
    startISO: "2024-01-01T00:00:00.000Z",
    endISO: "2024-01-05T00:00:00.000Z",
    bucket: "1d" as const,
    tz: "UTC",
  };

  it("delegates to the read repository with bucket spec and clamped limit", async () => {
    const repo = makeRepo();
    const query = new GetDashboardVisualization(repo, {
      ...LIMITS,
      maxDashboardMetrics: 4,
    });

    await query.execute({ ...baseInput, limit: 999, fill: "zero" });

    expect(repo.fetchDashboardVisualization).toHaveBeenCalledTimes(1);
    const payload = (repo.fetchDashboardVisualization as jest.Mock).mock
      .calls[0][0] as any;
    expect(payload).toMatchObject({
      userId: baseInput.userId,
      organizationId: TEST_ORG_ID,
      startISO: baseInput.startISO,
      endISO: baseInput.endISO,
      bucket: baseInput.bucket,
      tz: baseInput.tz,
      fill: "zero",
      limit: 4,
    });
    expect(payload.bucketSpec).toMatchObject({
      iso: "P1D",
      approxMs: expect.any(Number),
    });
  });

  it("refuses a range of more buckets than its limit", async () => {
    const repo = makeRepo();
    const query = new GetDashboardVisualization(repo, {
      ...LIMITS,
      maxBuckets: 3,
    });

    await expect(query.execute(baseInput)).rejects.toThrow(
      "Range too large for P1D (~6 buckets, max=3)",
    );
    expect(repo.fetchDashboardVisualization).not.toHaveBeenCalled();
  });

  it("throws when the requested range is invalid", async () => {
    const repo = makeRepo();
    const query = new GetDashboardVisualization(repo, LIMITS);

    await expect(
      query.execute({
        ...baseInput,
        startISO: baseInput.endISO,
        endISO: baseInput.startISO,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.fetchDashboardVisualization).not.toHaveBeenCalled();
  });
});
