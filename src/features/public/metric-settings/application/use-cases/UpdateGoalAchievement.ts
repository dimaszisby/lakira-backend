import {
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { MetricSettingsRepository } from "../../domain/repositories/MetricSettingsRepository.js";
import { CacheInvalidationPort } from "../ports/CacheInvalidationPort.js";
import { MetricSettings } from "../../domain/entities/MetricSettings.js";

export class UpdateGoalAchievement {
  constructor(
    private repo: MetricSettingsRepository,
    private cache: CacheInvalidationPort,
  ) {}

  async execute(
    userId: string,
    organizationId: string,
    settingsId: string,
  ): Promise<MetricSettings> {
    if (!userId) throw new UnauthorizedError("User not authenticated");
    const settings = await this.repo.findById(
      userId,
      organizationId,
      settingsId,
    );
    if (!settings) throw new NotFoundError("Metric Settings not found");

    settings.markAchieved();
    const saved = await this.repo.save(organizationId, settings);
    await this.cache.invalidate(
      userId,
      organizationId,
      settings.metricId,
      settings.id,
    );
    return saved;
  }
}
