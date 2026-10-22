import { MetricCategoryRepository } from "../../domain/repositories/MetricCategoryRepository.js";
import { ListQuery, ListResult } from "../../domain/types.js";
import { MetricCategory } from "../../domain/entities/MetricCategory.js";

/**
 * Lists a user's categories. The list cache wraps the repository `feature.ts`
 * hands in; this layer names no cache key (architecture-boundaries D-02).
 */
export class ListCategories {
  constructor(private repo: MetricCategoryRepository) {}

  execute(q: ListQuery): Promise<ListResult<MetricCategory>> {
    return this.repo.list(q);
  }
}
