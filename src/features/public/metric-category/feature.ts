import { MetricCategoryRepoSequelize } from "./infrastructure/persistence/repositories/MetricCategoryRepoSequelize.js";
import { MetricCategoryCacheRedis } from "./infrastructure/cache/MetricCategoryCacheRedis.js";
import { CreateCategory } from "./application/use-cases/CreateCategory.js";
import { UpdateCategory } from "./application/use-cases/UpdateCategory.js";
import { DeleteCategory } from "./application/use-cases/DeleteCategory.js";
import { GenerateDummyCategories } from "./application/use-cases/GenerateDummyCategories.js";
import { ListCategories } from "./application/queries/ListCategories.js";
import { GetCategory } from "./application/queries/GetCategory.js";
import { MetricCategoryFactory } from "./domain/services/MetricCategoryFactory.js";
import type { MetricCategoryRepository } from "./domain/repositories/MetricCategoryRepository.js";
import type { CachePort } from "./application/ports/CachePort.js";

export type MetricCategoryFeatureOverrides = {
  repo?: MetricCategoryRepository;
  cache?: CachePort;
};

export const buildMetricCategoryFeature = (
  overrides: MetricCategoryFeatureOverrides = {},
) => {
  const repo = overrides.repo ?? new MetricCategoryRepoSequelize();
  const cache = overrides.cache ?? new MetricCategoryCacheRedis();
  const factory = new MetricCategoryFactory();

  return {
    createCategory: new CreateCategory(repo, cache),
    listCategories: new ListCategories(repo, cache),
    getCategory: new GetCategory(repo),
    updateCategory: new UpdateCategory(repo, cache),
    deleteCategory: new DeleteCategory(repo, cache),
    generateDummyCategories: new GenerateDummyCategories(repo, cache, factory),
  };
};

/** What `buildMetricCategoryFeature` builds: the type a router and its controller are handed (ADR-0072). */
export type MetricCategoryFeature = ReturnType<
  typeof buildMetricCategoryFeature
>;
