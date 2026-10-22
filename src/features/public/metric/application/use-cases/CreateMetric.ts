import {
  ConflictError,
  NotFoundError,
} from "@/shared/domain/errors/DomainError.js";
import { Metric } from "../../domain/entities/Metric.js";
import {
  CreateMetricDTO,
  MetricRepository,
} from "../../domain/repositories/MetricRepository.js";
import { CachePort } from "../ports/CachePort.js";
import { MetricSettingsPort } from "../ports/MetricSettingsPort.js";
import { TransactionPort } from "@/shared/application/ports/TransactionPort.js";

type Input = CreateMetricDTO;

export class CreateMetric {
  constructor(
    private repo: MetricRepository,
    private settings: MetricSettingsPort,
    private cache: CachePort,
    private tx: TransactionPort,
  ) {}

  async execute(input: Input): Promise<Metric> {
    if (
      await this.repo.existsByName(
        input.userId,
        input.organizationId,
        input.name,
      )
    ) {
      throw new ConflictError("Metric already exists");
    }

    if (input.categoryId) {
      const exists = await this.repo.categoryExists(
        input.userId,
        input.organizationId,
        input.categoryId,
      );
      if (!exists) throw new NotFoundError("Category not found");
    }

    if (input.originalMetricId) {
      const exists = await this.repo.originalMetricExists(
        input.userId,
        input.originalMetricId,
      );
      if (!exists) throw new NotFoundError("Original metric not found");
    }

    return this.tx.runInTransaction(async (t) => {
      const metric = await this.repo.create(input, t);

      await this.settings.createDefault(metric.id, input.organizationId, t);

      if (this.cache.isEnabled()) {
        await this.cache.invalidateMetrics(
          metric.userId,
          input.organizationId,
          metric.id,
        );
      }

      return metric;
    });
  }
}
