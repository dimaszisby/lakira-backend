import { UnauthorizedError } from "@/shared/domain/errors/DomainError.js";
import {
  ListMetricSettingsOptions,
  ListMetricSettingsResult,
  MetricSettingsRepository,
} from "../../domain/repositories/MetricSettingsRepository.js";

export class ListMetricSettingsViaCursor {
  constructor(private repo: MetricSettingsRepository) {}

  async execute(
    options: ListMetricSettingsOptions,
  ): Promise<ListMetricSettingsResult> {
    if (!options.userId) throw new UnauthorizedError("User not authenticated");
    return this.repo.listByCursor(options);
  }
}
