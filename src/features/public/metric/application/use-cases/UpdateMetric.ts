import { MetricRepository } from "../../domain/repositories/MetricRepository.js";
import { CachePort } from "../ports/CachePort.js";
import AppError from "@/utils/AppError.js";

import type { Metric } from "../../domain/entities/Metric.js";

/** The fields a metric can be updated with: what the entity's own `update` accepts. */
export type UpdateMetricData = Parameters<Metric["update"]>[0];

type Input = {
  userId: string;
  organizationId: string;
  metricId: string;
  data: UpdateMetricData;
};

export class UpdateMetric {
  constructor(
    private repo: MetricRepository,
    private cache: CachePort,
  ) {}

  async execute({ userId, organizationId, metricId, data }: Input) {
    const metric = await this.repo.findOwnedById(
      userId,
      organizationId,
      metricId,
    );

    if (data.categoryId != null) {
      const exists = await this.repo.categoryExists(
        userId,
        organizationId,
        data.categoryId,
      );
      if (!exists) throw new AppError("Category not found", 404);
    }

    if (data.originalMetricId != null) {
      const exists = await this.repo.originalMetricExists(
        userId,
        data.originalMetricId,
      );
      if (!exists) throw new AppError("Original metric not found", 404);
    }

    if (data.name !== undefined) {
      const normalizedName = data.name.trim().toLowerCase();
      const currentName = metric.name.trim().toLowerCase();
      if (normalizedName !== currentName) {
        const exists = await this.repo.existsByName(
          userId,
          organizationId,
          data.name,
        );
        if (exists) throw new AppError("Metric already exists", 409);
      }
    }

    const update: UpdateMetricData = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) {
      update.description = data.description ?? null;
    }
    if (data.defaultUnit !== undefined) update.defaultUnit = data.defaultUnit;
    if (data.categoryId !== undefined)
      update.categoryId = data.categoryId ?? null;
    if (data.originalMetricId !== undefined) {
      update.originalMetricId = data.originalMetricId ?? null;
    }
    if (data.isPublic !== undefined) update.isPublic = data.isPublic;

    if (!Object.keys(update).length) {
      throw new AppError("Update payload cannot be empty", 400);
    }

    metric.update(update);

    const saved = await this.repo.save(organizationId, metric);

    if (this.cache.isEnabled() && metric.id) {
      await this.cache.invalidateMetrics(userId, organizationId, metric.id);
    }

    return saved;
  }
}
