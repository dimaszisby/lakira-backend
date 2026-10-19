import { jest } from "@jest/globals";
import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import { GetDashboardVisualization } from "@/features/analytics/application/queries/GetDashboardVisualization.js";
import type { VisualizationReadRepository } from "@/features/analytics/application/ports/VisualizationReadRepository.js";
import { withTestEnv } from "@/tests/env-test-utils.js";

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
    const overrideLimit = "4";
    await withTestEnv(
      async () => {
        const repo = makeRepo();
        const query = new GetDashboardVisualization(repo);

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
          limit: Number(overrideLimit),
        });
        expect(payload.bucketSpec).toMatchObject({
          iso: "P1D",
          approxMs: expect.any(Number),
        });
      },
      { overrides: { VIZ_DASH_MAX_METRICS: overrideLimit } },
    );
  });

  it("throws when the requested range is invalid", async () => {
    const repo = makeRepo();
    const query = new GetDashboardVisualization(repo);

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
