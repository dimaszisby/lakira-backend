import { GetVisualization } from "./application/queries/GetVisualization.js";
import { GetDashboardVisualization } from "./application/queries/GetDashboardVisualization.js";
import { GetMetricTrend } from "./application/queries/GetMetricTrend.js";
import { VisualizationReadRepoSequelize } from "./infrastructure/persistence/VisualizationReadRepoSequelize.js";
import { VisualizationCacheRedis } from "./infrastructure/cache/VisualizationCacheRedis.js";
import { TrendRepoSequelize } from "./infrastructure/persistence/TrendRepoSequelize.js";
import { MetricAccessSequelize } from "@/features/metric/public.js";
import type { MetricAccessPort } from "@/features/public/metric/application/ports/MetricAccessPort.js";
import type { TrendRepository } from "./application/ports/TrendRepository.js";
import type { VisualizationCachePort } from "./application/ports/VisualizationCachePort.js";
import type { VisualizationReadRepository } from "./application/ports/VisualizationReadRepository.js";

export type AnalyticsFeatureOverrides = {
  metricAccess?: MetricAccessPort;
  trendRepo?: TrendRepository;
  vizCache?: VisualizationCachePort;
  vizRepo?: VisualizationReadRepository;
};

export const buildAnalyticsFeature = (
  overrides: AnalyticsFeatureOverrides = {},
) => {
  const metricAccess = overrides.metricAccess ?? new MetricAccessSequelize();
  const trendRepo = overrides.trendRepo ?? new TrendRepoSequelize();
  const cache = overrides.vizCache ?? new VisualizationCacheRedis();
  const repo = overrides.vizRepo ?? new VisualizationReadRepoSequelize(cache);

  return {
    getVisualization: new GetVisualization(repo),
    getDashboardVisualization: new GetDashboardVisualization(repo),
    // wired and ready; endpoint not yet exposed via router
    getMetricTrend: new GetMetricTrend(metricAccess, trendRepo),
  };
};
