import { jest } from "@jest/globals";
import {
  ConflictError,
  NotFoundError,
} from "@/shared/domain/errors/DomainError.js";
import { CreateMetric } from "@/features/metric/application/use-cases/CreateMetric.js";
import { MetricRepository } from "@/features/metric/domain/repositories/MetricRepository.js";
import { Metric } from "@/features/metric/domain/entities/Metric.js";
import { MetricSettingsPort } from "@/features/metric/application/ports/MetricSettingsPort.js";
import { CachePort } from "@/features/metric/application/ports/CachePort.js";
import { TransactionPort } from "@/shared/application/ports/TransactionPort.js";

type RepoMock = jest.Mocked<MetricRepository>;
type SettingsMock = jest.Mocked<MetricSettingsPort>;
type CacheMock = jest.Mocked<CachePort>;
type TxMock = jest.Mocked<TransactionPort>;

const makeMetric = () =>
  Metric.fromProps({
    id: "metric-1",
    userId: "user-1",
    name: "Steps",
    defaultUnit: "steps",
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    categoryId: null,
    originalMetricId: null,
    description: null,
    deletedAt: null,
  });

const build = () => {
  const repo = {
    existsByName: jest.fn(),
    categoryExists: jest.fn(),
    create: jest.fn(),
  } as unknown as RepoMock;
  const settings = {
    createDefault: jest.fn(),
  } as unknown as SettingsMock;
  const cache = {
    isEnabled: jest.fn(),
    invalidateMetrics: jest.fn(),
  } as unknown as CacheMock;
  const tx = {
    runInTransaction: jest.fn(),
  } as unknown as TxMock;

  const sut = new CreateMetric(repo, settings, cache, tx);
  return { sut, repo, settings, cache, tx };
};

describe("CreateMetric use case", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("creates metric, settings, and invalidates cache inside transaction", async () => {
    const { sut, repo, settings, cache, tx } = build();
    const metric = makeMetric();
    const fakeTx = Symbol("tx");

    repo.existsByName.mockResolvedValue(false);
    repo.categoryExists.mockResolvedValue(true);
    repo.create.mockResolvedValue(metric);
    settings.createDefault.mockResolvedValue();
    cache.isEnabled.mockReturnValue(true);
    cache.invalidateMetrics.mockResolvedValue();
    tx.runInTransaction.mockImplementation(async (fn) => fn(fakeTx));

    const result = await sut.execute({
      userId: "user-1",
      organizationId: "org-1",
      categoryId: "cat-1",
      originalMetricId: null,
      name: "Steps",
      description: "desc",
      defaultUnit: "steps",
      isPublic: true,
    });

    expect(result).toBe(metric);
    expect(repo.existsByName).toHaveBeenCalledWith("user-1", "org-1", "Steps");
    expect(repo.categoryExists).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "cat-1",
    );
    expect(repo.create).toHaveBeenCalledWith(
      {
        userId: "user-1",
        organizationId: "org-1",
        categoryId: "cat-1",
        originalMetricId: null,
        name: "Steps",
        description: "desc",
        defaultUnit: "steps",
        isPublic: true,
      },
      fakeTx,
    );
    expect(settings.createDefault).toHaveBeenCalledWith(
      metric.id,
      "org-1",
      fakeTx,
    );
    expect(cache.invalidateMetrics).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      metric.id,
    );
  });

  it("throws when name already exists", async () => {
    const { sut, repo, cache, tx } = build();
    repo.existsByName.mockResolvedValue(true);
    cache.isEnabled.mockReturnValue(false);
    tx.runInTransaction.mockImplementation(async (fn) => fn(Symbol("tx")));

    await expect(
      sut.execute({
        userId: "user-1",
        organizationId: "org-1",
        name: "Steps",
        defaultUnit: "steps",
        isPublic: true,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(repo.create).not.toHaveBeenCalled();
  });

  it("validates category ownership when provided", async () => {
    const { sut, repo, cache, tx } = build();
    repo.existsByName.mockResolvedValue(false);
    repo.categoryExists.mockResolvedValue(false);
    cache.isEnabled.mockReturnValue(false);
    tx.runInTransaction.mockImplementation(async (fn) => fn(Symbol("tx")));

    await expect(
      sut.execute({
        userId: "user-1",
        organizationId: "org-1",
        categoryId: "cat-1",
        name: "Steps",
        defaultUnit: "steps",
        isPublic: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(repo.create).not.toHaveBeenCalled();
  });
});
