import { ForbiddenError } from "@/shared/domain/errors/DomainError.js";
import type {
  ListMetricsResult,
  ListOpts,
  MetricReadRepository,
} from "../ports/MetricReadRepository.js";

export class ListMetrics {
  constructor(private repo: MetricReadRepository) {}

  async execute(options: ListOpts): Promise<ListMetricsResult> {
    if (!options.userId) throw new ForbiddenError("User not authenticated");
    return this.repo.listMetrics(options);
  }
}

export type { ListMetricsResult, ListOpts };
