import { jest } from "@jest/globals";
import {
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { UpdateGoalAchievement } from "@/features/metric-settings/application/use-cases/UpdateGoalAchievement.js";
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

  const sut = new UpdateGoalAchievement(repo, cache);
  return { sut, repo, cache };
};

describe("UpdateGoalAchievement", () => {
  it("requires authenticated user", async () => {
    const { sut } = setup();
    await expect(
      sut.execute("", TEST_ORG_ID, "settings-1"),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws when settings cannot be found", async () => {
    const { sut, repo } = setup();
    repo.findById.mockResolvedValue(null);

    await expect(
      sut.execute("user-1", TEST_ORG_ID, "settings-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("marks goal achieved, saves, and invalidates cache", async () => {
    const { sut, repo, cache } = setup();
    const entity = buildMetricSettings({
      id: "settings-12",
      metricId: "metric-45",
      isAchieved: false,
    });
    const markSpy = jest.spyOn(entity, "markAchieved");
    repo.findById.mockResolvedValue(entity);
    repo.save.mockResolvedValue(entity);
    cache.invalidate.mockResolvedValue();

    const result = await sut.execute("user-2", TEST_ORG_ID, "settings-12");

    expect(markSpy).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(TEST_ORG_ID, entity);
    expect(cache.invalidate).toHaveBeenCalledWith(
      "user-2",
      TEST_ORG_ID,
      "metric-45",
      "settings-12",
    );
    expect(result).toBe(entity);
  });
});
