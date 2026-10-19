import { jest } from "@jest/globals";
import {
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { DeleteMetricSettings } from "@/features/metric-settings/application/use-cases/DeleteMetricSettings.js";
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

  const sut = new DeleteMetricSettings(repo, cache);
  return { sut, repo, cache };
};

describe("DeleteMetricSettings", () => {
  it("throws when user id missing", async () => {
    const { sut } = setup();
    await expect(
      sut.execute("", TEST_ORG_ID, "settings-1"),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws when settings cannot be found", async () => {
    const { sut, repo } = setup();
    repo.findById.mockResolvedValue(null);

    await expect(
      sut.execute("user-1", TEST_ORG_ID, "settings-unknown"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("deletes settings and invalidates cache", async () => {
    const { sut, repo, cache } = setup();
    const entity = buildMetricSettings({
      id: "settings-8",
      metricId: "metric-77",
    });
    repo.findById.mockResolvedValue(entity);
    repo.delete.mockResolvedValue();
    cache.invalidate.mockResolvedValue();

    await sut.execute("user-9", TEST_ORG_ID, "settings-8");

    expect(repo.delete).toHaveBeenCalledWith(TEST_ORG_ID, entity);
    expect(cache.invalidate).toHaveBeenCalledWith(
      "user-9",
      TEST_ORG_ID,
      "metric-77",
      "settings-8",
    );
  });
});
