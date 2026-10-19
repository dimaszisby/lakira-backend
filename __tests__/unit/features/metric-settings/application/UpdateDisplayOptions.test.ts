import { jest } from "@jest/globals";
import {
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { UpdateDisplayOptions } from "@/features/metric-settings/application/use-cases/UpdateDisplayOptions.js";
import { MetricSettingsRepository } from "@/features/metric-settings/domain/repositories/MetricSettingsRepository.js";
import { CacheInvalidationPort } from "@/features/metric-settings/application/ports/CacheInvalidationPort.js";
import { buildMetricSettings } from "../../../factories/metric-settings.js";

type RepoMock = jest.Mocked<MetricSettingsRepository>;
type CacheMock = jest.Mocked<CacheInvalidationPort>;

const TEST_ORG_ID = "org-test-id";

const setup = () => {
  const repo: RepoMock = {
    create: jest.fn(),
    findByMetricId: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    listByCursor: jest.fn(),
  };

  const cache: CacheMock = {
    invalidate: jest.fn(),
  };

  const sut = new UpdateDisplayOptions(repo, cache);
  return { sut, repo, cache };
};

describe("UpdateDisplayOptions", () => {
  it("requires authenticated user", async () => {
    const { sut } = setup();
    await expect(
      sut.execute("", TEST_ORG_ID, "settings-1", {
        showOnDashboard: true,
        priority: 1,
        chartType: "line",
        color: "#000000",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws when settings missing", async () => {
    const { sut, repo } = setup();
    repo.findById.mockResolvedValue(null);

    await expect(
      sut.execute("user-1", TEST_ORG_ID, "settings-1", {
        showOnDashboard: true,
        priority: null,
        chartType: null,
        color: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it("updates display options, saves, and invalidates cache", async () => {
    const { sut, repo, cache } = setup();
    const entity = buildMetricSettings({
      id: "settings-20",
      metricId: "metric-55",
    });
    const updateSpy = jest.spyOn(entity, "updateDisplayOptions");
    repo.findById.mockResolvedValue(entity);
    repo.save.mockResolvedValue(entity);
    cache.invalidate.mockResolvedValue();

    const result = await sut.execute("user-5", TEST_ORG_ID, "settings-20", {
      showOnDashboard: false,
      priority: 10,
      chartType: "bar",
      color: "#ABCDEF",
    });

    expect(updateSpy).toHaveBeenCalledWith({
      showOnDashboard: false,
      priority: 10,
      chartType: "bar",
      color: "#ABCDEF",
    });
    expect(repo.save).toHaveBeenCalledWith(TEST_ORG_ID, entity);
    expect(cache.invalidate).toHaveBeenCalledWith(
      "user-5",
      TEST_ORG_ID,
      "metric-55",
      "settings-20",
    );
    expect(result).toBe(entity);
  });
});
