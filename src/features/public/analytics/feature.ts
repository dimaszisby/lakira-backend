import { env } from "@/config/envManager.js";
import { GetVisualization } from "./application/queries/GetVisualization.js";
import { GetDashboardVisualization } from "./application/queries/GetDashboardVisualization.js";
import { GetMetricTrend } from "./application/queries/GetMetricTrend.js";
import { VisualizationReadRepoSequelize } from "./infrastructure/persistence/VisualizationReadRepoSequelize.js";
import { VisualizationCacheRedis } from "./infrastructure/cache/VisualizationCacheRedis.js";
import { TrendRepoSequelize } from "./infrastructure/persistence/TrendRepoSequelize.js";
import { MetricAccessSequelize } from "@/features/metric/public.js";
import type { MetricAccessPort } from "./application/ports/MetricAccessPort.js";
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

  // Config enters here, not in the queries (v6-small-items D-04).
  const maxBuckets = env.VIZ_MAX_BUCKETS;

  return {
    getVisualization: new GetVisualization(repo, { maxBuckets }),
    getDashboardVisualization: new GetDashboardVisualization(repo, {
      maxBuckets,
      maxDashboardMetrics: env.VIZ_DASH_MAX_METRICS,
    }),
    // Served by metric's router, at /metrics/:metricId/trends (src/app.ts).
    getMetricTrend: new GetMetricTrend(metricAccess, trendRepo),
  };
};

/** What `buildAnalyticsFeature` builds: the type a router and its controller are handed (ADR-0072). */
export type AnalyticsFeature = ReturnType<typeof buildAnalyticsFeature>;
