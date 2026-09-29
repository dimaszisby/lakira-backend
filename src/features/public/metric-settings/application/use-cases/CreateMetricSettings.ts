import AppError from "@/utils/AppError.js";
import { MetricSettings } from "../../domain/entities/MetricSettings.js";
import {
  CreateMetricSettingsDTO,
  MetricSettingsRepository,
} from "../../domain/repositories/MetricSettingsRepository.js";
import { CacheInvalidationPort } from "../ports/CacheInvalidationPort.js";
import type { MetricAccessPort } from "../ports/MetricAccessPort.js";

export type CreateMetricSettingsInput = Partial<CreateMetricSettingsDTO> & {
  userId: string;
  organizationId: string;
  metricId: string;
};

export class CreateMetricSettings {
  constructor(
    private repo: MetricSettingsRepository,
    private cache: CacheInvalidationPort,
    private metricAccess: MetricAccessPort,
  ) {}

  async execute(input: CreateMetricSettingsInput): Promise<MetricSettings> {
    const { userId, organizationId, metricId } = input;
    if (!userId) throw new AppError("User not authenticated", 401);

    await this.metricAccess.ensureMetricOwnership(
      userId,
      organizationId,
      metricId,
    );

    const existing = await this.repo.findByMetricId(organizationId, metricId);
    if (existing) {
      throw new AppError("Metric settings already exist for this metric", 409);
    }

    const created = await this.repo.create({
      metricId,
      organizationId: input.organizationId,
      isActive: input.isActive ?? true,
      goalEnabled: input.goalEnabled ?? false,
      goalType: input.goalType ?? null,
      goalValue: input.goalValue ?? null,
      timeFrameEnabled: input.timeFrameEnabled ?? false,
      startDate: input.startDate ?? null,
      deadlineDate: input.deadlineDate ?? null,
      alertEnabled: input.alertEnabled ?? false,
      alertThresholds:
        input.alertThresholds ?? (input.alertEnabled ? 80 : null),
      isAchieved: false,
      displayOptions: {
        showOnDashboard: input.displayOptions?.showOnDashboard ?? true,
        priority: input.displayOptions?.priority ?? 1,
        chartType: input.displayOptions?.chartType ?? "line",
        color: input.displayOptions?.color ?? "#E897A3",
      },
    });

    await this.cache.invalidate(userId, organizationId, metricId, created.id);
    return created;
  }
}
