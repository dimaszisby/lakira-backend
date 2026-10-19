import { ConflictError } from "@/shared/domain/errors/DomainError.js";
import { MetricCategoryRepository } from "../../domain/repositories/MetricCategoryRepository.js";
import { CachePort } from "../ports/CachePort.js";
import { METRIC_CATEGORY_CURSOR_NAMESPACE_ALL } from "../cache.constants.js";

type Input = {
  userId: string;
  organizationId: string;
  name: string;
  color?: string;
  icon?: string;
};

export class CreateCategory {
  constructor(
    private repo: MetricCategoryRepository,
    private cache: CachePort,
  ) {}

  async execute({ userId, organizationId, name, color, icon }: Input) {
    if (await this.repo.existsByName(userId, organizationId, name)) {
      throw new ConflictError("Category already exists");
    }
    const category = await this.repo.create(userId, organizationId, {
      name,
      color,
      icon,
    });
    if (this.cache.isEnabled()) {
      await this.cache.delByPattern(
        `${METRIC_CATEGORY_CURSOR_NAMESPACE_ALL}:${userId}:*`,
      ); // invalidate lists
    }
    return category;
  }
}
