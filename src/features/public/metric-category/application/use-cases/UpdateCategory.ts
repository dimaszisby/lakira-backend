import {
  ConflictError,
  NotFoundError,
} from "@/shared/domain/errors/DomainError.js";
import { MetricCategoryRepository } from "../../domain/repositories/MetricCategoryRepository.js";
import { CachePort } from "../ports/CachePort.js";
import { METRIC_CATEGORY_CURSOR_NAMESPACE_ALL } from "../cache.constants.js";

type Input = {
  userId: string;
  organizationId: string;
  categoryId: string;
  name?: string;
  color?: string;
  icon?: string;
};

export class UpdateCategory {
  constructor(
    private repo: MetricCategoryRepository,
    private cache: CachePort,
  ) {}

  async execute({
    userId,
    organizationId,
    categoryId,
    name,
    color,
    icon,
  }: Input) {
    const current = await this.repo.findById(
      userId,
      organizationId,
      categoryId,
    );
    if (!current) {
      throw new NotFoundError("Metric Category not found");
    }

    if (name && name !== current.name) {
      const exists = await this.repo.existsByName(userId, organizationId, name);
      if (exists) {
        throw new ConflictError("Metric Category name already exists");
      }
    }

    const updated = await this.repo.update(userId, organizationId, categoryId, {
      name,
      color,
      icon,
    });

    if (this.cache.isEnabled()) {
      await this.cache.delByPattern(
        `${METRIC_CATEGORY_CURSOR_NAMESPACE_ALL}:${userId}:*`,
      );
      await this.cache.delByPattern(`category:${userId}:${categoryId}`);
    }

    return updated;
  }
}
