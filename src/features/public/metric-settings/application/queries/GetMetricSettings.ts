import {
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { MetricSettings } from "../../domain/entities/MetricSettings.js";
import { MetricSettingsRepository } from "../../domain/repositories/MetricSettingsRepository.js";

export class GetMetricSettings {
  constructor(private repo: MetricSettingsRepository) {}

  async execute(
    userId: string,
    organizationId: string,
    settingsId: string,
  ): Promise<MetricSettings> {
    if (!userId) throw new UnauthorizedError("User not authenticated");

    const found = await this.repo.findById(userId, organizationId, settingsId);
    if (!found) throw new NotFoundError("Metric Settings not found");

    return found;
  }
}
