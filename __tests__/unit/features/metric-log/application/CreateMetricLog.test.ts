import { jest } from "@jest/globals";
import { CreateMetricLog } from "@/features/metric-log/application/use-cases/CreateMetricLog.js";
import { MetricLogRepository } from "@/features/metric-log/domain/repositories/MetricLogRepository.js";
import type { MetricAccessPort } from "@/features/public/metric-log/application/ports/MetricAccessPort.js";
import { CachePort } from "@/features/metric-log/application/ports/CachePort.js";
import { MetricLog } from "@/features/metric-log/domain/entities/MetricLog.js";
import AppError from "@/utils/AppError.js";

const buildLog = () =>
  MetricLog.fromProps({
    id: "log-1",
    metricId: "metric-1",
    logValue: 5,
    type: "manual",
    loggedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const setup = () => {
  const repo: jest.Mocked<MetricLogRepository> = {
    existsAtTimestamp: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const access: jest.Mocked<MetricAccessPort> = {
    ensureMetricOwnership: jest.fn(),
  };
  const cache: jest.Mocked<CachePort> = {
    isEnabled: jest.fn(),
    invalidate: jest.fn(),
  };
  const sut = new CreateMetricLog(repo, access, cache);
  return { sut, repo, access, cache };
};

describe("CreateMetricLog use case", () => {
  beforeEach(() => jest.resetAllMocks());

  it("creates log and invalidates cache", async () => {
    const { sut, repo, access, cache } = setup();
    const log = buildLog();
    repo.existsAtTimestamp.mockResolvedValue(false);
    repo.create.mockResolvedValue(log);
    cache.isEnabled.mockReturnValue(true);

    const result = await sut.execute({
      userId: "user-1",
      organizationId: "org-1",
      metricId: "metric-1",
      logValue: 10,
      type: "automatic",
    });

    expect(access.ensureMetricOwnership).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "metric-1",
    );
    expect(repo.create).toHaveBeenCalled();
    expect(cache.invalidate).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "metric-1",
      log.id,
    );
    expect(result).toBe(log);
  });

  it("rejects duplicate timestamps", async () => {
    const { sut, repo } = setup();
    repo.existsAtTimestamp.mockResolvedValue(true);

    await expect(
      sut.execute({
        userId: "user-1",
        organizationId: "org-1",
        metricId: "metric-1",
        logValue: 10,
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});
