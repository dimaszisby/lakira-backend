import AppError from "@/utils/AppError.js";
import {
  MetricSettings,
  type UpdateMetricSettingsProps,
} from "../../domain/entities/MetricSettings.js";
import { MetricSettingsRepository } from "../../domain/repositories/MetricSettingsRepository.js";
import { CacheInvalidationPort } from "../ports/CacheInvalidationPort.js";

/**
 * What a settings update may carry. The entity's own update props, except that the
 * two dates may arrive as the strings a request carries; `execute` turns them into
 * dates.
 */
export type UpdateMetricSettingsInput = Omit<
  UpdateMetricSettingsProps,
  "startDate" | "deadlineDate"
> & {
  startDate?: Date | string | null;
  deadlineDate?: Date | string | null;
};

export class UpdateMetricSettings {
  constructor(
    private repo: MetricSettingsRepository,
    private cache: CacheInvalidationPort,
  ) {}

  async execute(
    userId: string,
    organizationId: string,
    settingsId: string,
    payload: UpdateMetricSettingsInput,
  ): Promise<MetricSettings> {
    if (!userId) throw new AppError("User not authenticated", 401);
    const settings = await this.repo.findById(
      userId,
      organizationId,
      settingsId,
    );
    if (!settings) throw new AppError("Metric Settings not found", 404);

    const update: UpdateMetricSettingsProps = {};
    if (payload.goalEnabled !== undefined)
      update.goalEnabled = payload.goalEnabled;
    if (payload.goalType !== undefined) update.goalType = payload.goalType;
    if (payload.goalValue !== undefined) update.goalValue = payload.goalValue;
    if (payload.timeFrameEnabled !== undefined) {
      update.timeFrameEnabled = payload.timeFrameEnabled;
    }
    if (payload.startDate !== undefined) {
      update.startDate = payload.startDate ? new Date(payload.startDate) : null;
    }
    if (payload.deadlineDate !== undefined) {
      update.deadlineDate = payload.deadlineDate
        ? new Date(payload.deadlineDate)
        : null;
    }
    if (payload.alertEnabled !== undefined)
      update.alertEnabled = payload.alertEnabled;
    if (payload.alertThresholds !== undefined) {
      update.alertThresholds = payload.alertThresholds;
    }
    if (payload.displayOptions !== undefined) {
      update.displayOptions = payload.displayOptions;
    }

    const hasDates =
      update.startDate !== undefined || update.deadlineDate !== undefined;
    if (update.timeFrameEnabled === undefined && hasDates) {
      update.timeFrameEnabled = true;
    }

    settings.updateDetails(update);

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
