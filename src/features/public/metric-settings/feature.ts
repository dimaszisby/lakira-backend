import { MetricSettingsRepositorySequelize } from "./infrastructure/persistence/MetricSettingsRepositorySequelize.js";
import { MetricSettingsCacheInvalidator } from "./infrastructure/providers/MetricSettingsCacheInvalidator.js";
import { CreateMetricSettings } from "./application/use-cases/CreateMetricSettings.js";
import { GetMetricSettings } from "./application/queries/GetMetricSettings.js";
import { UpdateMetricSettings } from "./application/use-cases/UpdateMetricSettings.js";
import { DeleteMetricSettings } from "./application/use-cases/DeleteMetricSettings.js";
import { UpdateGoalAchievement } from "./application/use-cases/UpdateGoalAchievement.js";
import { UpdateDisplayOptions } from "./application/use-cases/UpdateDisplayOptions.js";
import { ListMetricSettingsViaCursor } from "./application/queries/ListMetricSettingsViaCursor.js";
import type { MetricAccessPort } from "./application/ports/MetricAccessPort.js";
import type { CacheInvalidationPort } from "./application/ports/CacheInvalidationPort.js";

/** What src/composition/ supplies: another feature's adapter (metric-access-wiring D-01, D-03). */
export type MetricSettingsFeatureDeps = {
  metricAccess: MetricAccessPort;
};

export type MetricSettingsFeatureOverrides = {
  cacheInvalidation?: CacheInvalidationPort;
};

export const buildMetricSettingsFeature = (
  { metricAccess }: MetricSettingsFeatureDeps,
  overrides: MetricSettingsFeatureOverrides = {},
) => {
  const repo = new MetricSettingsRepositorySequelize();
  const cache =
    overrides.cacheInvalidation ?? new MetricSettingsCacheInvalidator();

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

/** What `buildMetricSettingsFeature` builds: the type a router and its controller are handed (ADR-0072). */
export type MetricSettingsFeature = ReturnType<
  typeof buildMetricSettingsFeature
>;
