import { jest } from "@jest/globals";
import { ForbiddenError } from "@/shared/domain/errors/DomainError.js";
import { ListMetrics } from "@/features/metric/application/queries/ListMetrics.js";
import type { ListMetricsResult } from "@/features/metric/application/ports/MetricReadRepository.js";

const TEST_ORG_ID = "org-test-id";

describe("ListMetrics query", () => {
  const baseResult: ListMetricsResult = {
    items: [],
    nextCursor: undefined,
    sort: "-createdAt",
    limit: 10,
  };

  it("throws when userId is missing", async () => {
    const repo = {
      listMetrics: jest.fn<(...args: any[]) => Promise<ListMetricsResult>>(),
    } as any;
    const query = new ListMetrics(repo);

    await expect(
      query.execute({
        userId: "" as any,
        organizationId: TEST_ORG_ID,
        limit: 10,
        sort: "-createdAt",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.listMetrics).not.toHaveBeenCalled();
  });

  it("delegates to read repository", async () => {
    const repo = {
      listMetrics: jest
        .fn<(...args: any[]) => Promise<ListMetricsResult>>()
        .mockResolvedValue(baseResult),
    } as any;
    const query = new ListMetrics(repo);

    const output = await query.execute({
      userId: "user-1",
      organizationId: TEST_ORG_ID,
      limit: 5,
      sort: "-createdAt",
      q: "steps",
      filter: { categoryId: "cat-1" },
      includeTotal: true,
    });

    expect(repo.listMetrics).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: TEST_ORG_ID,
      limit: 5,
      sort: "-createdAt",
      q: "steps",
      filter: { categoryId: "cat-1" },
      includeTotal: true,
    });
    expect(output).toBe(baseResult);
  });
});
