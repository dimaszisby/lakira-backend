import { jest } from "@jest/globals";
import AppError from "@/utils/AppError.js";
import { CreateMetricSettings } from "@/features/metric-settings/application/use-cases/CreateMetricSettings.js";
import { MetricSettingsRepository } from "@/features/metric-settings/domain/repositories/MetricSettingsRepository.js";
import { CacheInvalidationPort } from "@/features/metric-settings/application/ports/CacheInvalidationPort.js";
import type { MetricAccessPort } from "@/features/public/metric-settings/application/ports/MetricAccessPort.js";
import { buildMetricSettings } from "../../../factories/metric-settings.js";

type RepoMock = jest.Mocked<MetricSettingsRepository>;
type CacheMock = jest.Mocked<CacheInvalidationPort>;
type AccessMock = jest.Mocked<MetricAccessPort>;

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

  const metricAccess: AccessMock = {
    ensureMetricOwnership: jest.fn(),
  };

  const sut = new CreateMetricSettings(repo, cache, metricAccess);
  return { sut, repo, cache, metricAccess };
};

describe("CreateMetricSettings", () => {
  it("throws when user is not authenticated", async () => {
    const { sut, repo } = setup();
    await expect(
      sut.execute({
        userId: "",
        organizationId: "org-1",
        metricId: "metric-1",
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(repo.findByMetricId).not.toHaveBeenCalled();
  });

  it("throws when settings already exist for metric", async () => {
    const { sut, repo, metricAccess } = setup();
    repo.findByMetricId.mockResolvedValue(buildMetricSettings());
    metricAccess.ensureMetricOwnership.mockResolvedValue();

    await expect(
      sut.execute({
        userId: "user-1",
        organizationId: "org-1",
        metricId: "metric-1",
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(repo.create).not.toHaveBeenCalled();
    expect(metricAccess.ensureMetricOwnership).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "metric-1",
    );
  });

  it("creates settings with defaults and invalidates cache", async () => {
    const { sut, repo, cache, metricAccess } = setup();
    const created = buildMetricSettings({
      id: "settings-123",
      metricId: "metric-99",
    });

    metricAccess.ensureMetricOwnership.mockResolvedValue();
    repo.findByMetricId.mockResolvedValue(null);
    repo.create.mockResolvedValue(created);
    cache.invalidate.mockResolvedValue();

    const result = await sut.execute({
      userId: "user-123",
      organizationId: "org-1",
      metricId: "metric-99",
    });

    expect(result).toBe(created);
    expect(repo.create).toHaveBeenCalledWith({
      metricId: "metric-99",
      organizationId: "org-1",
      isActive: true,
      goalEnabled: false,
      goalType: null,
      goalValue: null,
      timeFrameEnabled: false,
      startDate: null,
      deadlineDate: null,
      alertEnabled: false,
      alertThresholds: null,
      isAchieved: false,
      displayOptions: {
        showOnDashboard: true,
        priority: 1,
        chartType: "line",
        color: "#E897A3",
      },
    });

    expect(cache.invalidate).toHaveBeenCalledWith(
      "user-123",
      "org-1",
      "metric-99",
      "settings-123",
    );
    expect(metricAccess.ensureMetricOwnership).toHaveBeenCalledWith(
      "user-123",
      "org-1",
      "metric-99",
    );
  });
});
