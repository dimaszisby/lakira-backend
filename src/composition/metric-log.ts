import { AnalyticsVisualizationInvalidationAdapter } from "@/features/analytics/public.js";
import {
  MetricAccessSequelize,
  MetricCacheRedis,
} from "@/features/metric/public.js";
import {
  buildMetricLogFeature,
  type MetricLogFeatureDeps,
  type MetricLogFeatureOverrides,
} from "@/features/metric-log/feature.js";

/**
 * The metric-log feature as every process runs it (ADR-0056).
 *
 * The HTTP server and the worker both call this, so a queued job invalidates
 * exactly what the same request handled inline would. Metric-log declares the
 * invalidation port; analytics provides the adapter. Joining them here keeps
 * either feature from importing the other's composition root (ADR-0045). Its
 * access port is metric's adapter, joined here for the same reason
 * (metric-access-wiring D-01).
 *
 * Import a feature here through its `feature.ts` or `public.ts` only. `index.ts`
 * exports the router, which loads the HTTP stack into whatever imports this.
 *
 * `overrides` is for what legitimately differs per process: the server passes
 * its message queue and the access adapter it shares, the worker enqueues
 * nothing and gets an adapter of its own. A log write clears the metric's
 * cached list and entry through metric's cache adapter, joined here too (#251).
 */
export const buildWiredMetricLogFeature = ({
  metricAccess = new MetricAccessSequelize(),
  metricCache = new MetricCacheRedis(),
  ...overrides
}: Omit<MetricLogFeatureOverrides, "visualizationInvalidator"> &
  Partial<MetricLogFeatureDeps> = {}) =>
  buildMetricLogFeature(
    { metricAccess, metricCache },
    {
      ...overrides,
      visualizationInvalidator: new AnalyticsVisualizationInvalidationAdapter(),
    },
  );
