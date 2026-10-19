import { NotFoundError } from "@/shared/domain/errors/DomainError.js";
import { MetricCategoryRepository } from "../../domain/repositories/MetricCategoryRepository.js";
import { CachePort } from "../ports/CachePort.js";
import { METRIC_CATEGORY_CURSOR_NAMESPACE_ALL } from "../cache.constants.js";

export class DeleteCategory {
  constructor(
    private repo: MetricCategoryRepository,
    private cache: CachePort,
  ) {}

  async execute(userId: string, organizationId: string, categoryId: string) {
    const category = await this.repo.findById(
      userId,
      organizationId,
      categoryId,
    );
    if (!category) {
      throw new NotFoundError("Metric Category not found");
    }

    await this.repo.delete(userId, organizationId, categoryId);

    if (this.cache.isEnabled()) {
      await this.cache.delByPattern(
        `${METRIC_CATEGORY_CURSOR_NAMESPACE_ALL}:${userId}:*`,
      );
      await this.cache.delByPattern(`category:${userId}:${categoryId}`);
    }
  }
}
