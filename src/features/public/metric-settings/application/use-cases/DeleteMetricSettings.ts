import {
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { MetricSettingsRepository } from "../../domain/repositories/MetricSettingsRepository.js";
import { CacheInvalidationPort } from "../ports/CacheInvalidationPort.js";

export class DeleteMetricSettings {
  constructor(
    private repo: MetricSettingsRepository,
    private cache: CacheInvalidationPort,
  ) {}

  async execute(
    userId: string,
    organizationId: string,
    settingsId: string,
  ): Promise<void> {
    if (!userId) throw new UnauthorizedError("User not authenticated");
    const settings = await this.repo.findById(
      userId,
      organizationId,
      settingsId,
    );
    if (!settings) throw new NotFoundError("Metric Settings not found");

    await this.repo.delete(organizationId, settings);
    await this.cache.invalidate(
      userId,
      organizationId,
      settings.metricId,
      settings.id,
    );
  }
}
