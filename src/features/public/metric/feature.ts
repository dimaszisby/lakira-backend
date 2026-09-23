import { MetricRepoSequelize } from "./infrastructure/persistence/repositories/MetricRepoSequelize.js";
import { MetricSettingsPortSequelize } from "./infrastructure/persistence/repositories/MetricSettingsPortSequelize.js";
import { MetricCacheRedis } from "./infrastructure/cache/MetricCacheRedis.js";
import { SequelizeTransactionPort } from "./infrastructure/persistence/SequelizeTransactionPort.js";
import { UpdateMetric } from "./application/use-cases/UpdateMetric.js";
import { DeleteMetric } from "./application/use-cases/DeleteMetric.js";
import { GenerateDummyMetrics } from "./application/use-cases/GenerateDummyMetrics.js";
import { GetMetricDetail } from "./application/queries/GetMetricDetail.js";
import { CreateMetric } from "./application/use-cases/CreateMetric.js";
import { ListMetrics } from "./application/queries/ListMetrics.js";
import { MetricReadRepoSequelize } from "./infrastructure/persistence/repositories/MetricReadRepoSequelize.js";
import type { MetricRepository } from "./domain/repositories/MetricRepository.js";
import type { MetricReadRepository } from "./application/ports/MetricReadRepository.js";
import type { CachePort } from "./application/ports/CachePort.js";
import type { TransactionPort } from "./application/ports/TransactionPort.js";
import type { MetricSettingsPort } from "./application/ports/MetricSettingsPort.js";

export type MetricFeatureOverrides = {
  repo?: MetricRepository;
  readRepo?: MetricReadRepository;
  cache?: CachePort;
  tx?: TransactionPort;
  settings?: MetricSettingsPort;
};

export const buildMetricFeature = (overrides: MetricFeatureOverrides = {}) => {
  const repo = overrides.repo ?? new MetricRepoSequelize();
  const settings = overrides.settings ?? new MetricSettingsPortSequelize();
  const cache = overrides.cache ?? new MetricCacheRedis();
  const tx = overrides.tx ?? new SequelizeTransactionPort();
  const readRepo = overrides.readRepo ?? new MetricReadRepoSequelize();

  return {
    createMetric: new CreateMetric(repo, settings, cache, tx),
    updateMetric: new UpdateMetric(repo, cache),
    deleteMetric: new DeleteMetric(repo, cache),
    getMetricDetail: new GetMetricDetail(readRepo),
    listMetrics: new ListMetrics(readRepo),
    generateDummyMetrics: new GenerateDummyMetrics(repo, cache, tx),
  };
};
