import { jest } from "@jest/globals";
import {
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { UpdateMetricSettings } from "@/features/metric-settings/application/use-cases/UpdateMetricSettings.js";
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

  const sut = new UpdateMetricSettings(repo, cache);
  return { sut, repo, cache };
};

describe("UpdateMetricSettings", () => {
  it("throws when user is missing", async () => {
    const { sut } = setup();
    await expect(
      sut.execute("", TEST_ORG_ID, "settings-1", { goalEnabled: false }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws when settings cannot be found", async () => {
    const { sut, repo } = setup();
    repo.findById.mockResolvedValue(null);

    await expect(
      sut.execute("user-1", TEST_ORG_ID, "settings-unknown", {}),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it("updates settings, persists, and invalidates cache", async () => {
    const { sut, repo, cache } = setup();
    const entity = buildMetricSettings({
      id: "settings-5",
      metricId: "metric-9",
    });
    const updateSpy = jest.spyOn(entity, "updateDetails");

    repo.findById.mockResolvedValue(entity);
    repo.save.mockResolvedValue(entity);
    cache.invalidate.mockResolvedValue();

    const startDateValue = new Date("2024-03-01T00:00:00.000Z");
    const deadlineValue = new Date("2024-04-01T00:00:00.000Z");
    const payload = {
      goalEnabled: true,
      goalType: "cumulative" as const,
      goalValue: 50,
      timeFrameEnabled: true,
      startDate: startDateValue,
      deadlineDate: deadlineValue,
      alertEnabled: true,
      alertThresholds: 75,
      displayOptions: {
        showOnDashboard: false,
        priority: 3,
        chartType: "bar",
        color: "#FF00FF",
      },
    };

    const result = await sut.execute(
      "user-1",
      TEST_ORG_ID,
      "settings-5",
      payload,
    );

    expect(updateSpy).toHaveBeenCalledWith({
      goalEnabled: true,
      goalType: "cumulative",
      goalValue: 50,
      timeFrameEnabled: true,
      startDate: startDateValue,
      deadlineDate: deadlineValue,
      alertEnabled: true,
      alertThresholds: 75,
      displayOptions: payload.displayOptions,
    });

    expect(repo.save).toHaveBeenCalledWith(TEST_ORG_ID, entity);
    expect(cache.invalidate).toHaveBeenCalledWith(
      "user-1",
      TEST_ORG_ID,
      "metric-9",
      "settings-5",
    );
    expect(result).toBe(entity);
  });
});
