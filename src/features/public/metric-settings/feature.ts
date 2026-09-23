import { MetricSettingsRepositorySequelize } from "./infrastructure/persistence/MetricSettingsRepositorySequelize.js";
import { MetricSettingsCacheInvalidator } from "./infrastructure/providers/MetricSettingsCacheInvalidator.js";
import { MetricAccessSequelize } from "@/features/metric/public.js";
import { CreateMetricSettings } from "./application/use-cases/CreateMetricSettings.js";
import { GetMetricSettings } from "./application/queries/GetMetricSettings.js";
import { UpdateMetricSettings } from "./application/use-cases/UpdateMetricSettings.js";
import { DeleteMetricSettings } from "./application/use-cases/DeleteMetricSettings.js";
import { UpdateGoalAchievement } from "./application/use-cases/UpdateGoalAchievement.js";
import { UpdateDisplayOptions } from "./application/use-cases/UpdateDisplayOptions.js";
import { ListMetricSettingsViaCursor } from "./application/queries/ListMetricSettingsViaCursor.js";
import type { MetricAccessPort } from "@/features/public/metric/application/ports/MetricAccessPort.js";
import type { CacheInvalidationPort } from "./application/ports/CacheInvalidationPort.js";

export type MetricSettingsFeatureOverrides = {
  metricAccess?: MetricAccessPort;
  cacheInvalidation?: CacheInvalidationPort;
};

export const buildMetricSettingsFeature = (
  overrides: MetricSettingsFeatureOverrides = {},
) => {
  const repo = new MetricSettingsRepositorySequelize();
  const cache =
    overrides.cacheInvalidation ?? new MetricSettingsCacheInvalidator();
  const metricAccess = overrides.metricAccess ?? new MetricAccessSequelize();

  return {
    createSettings: new CreateMetricSettings(repo, cache, metricAccess),
    getSettings: new GetMetricSettings(repo),
    listSettings: new ListMetricSettingsViaCursor(repo),
    updateSettings: new UpdateMetricSettings(repo, cache),
    deleteSettings: new DeleteMetricSettings(repo, cache),
    updateGoalAchievement: new UpdateGoalAchievement(repo, cache),
    updateDisplayOptions: new UpdateDisplayOptions(repo, cache),
  };
};
