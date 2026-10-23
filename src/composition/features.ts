import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import { MetricAccessSequelize } from "@/features/metric/public.js";
import {
  buildAnalyticsFeature,
  type AnalyticsFeature,
} from "@/features/analytics/feature.js";
import type { AuthFeature } from "@/features/auth/feature.js";
import {
  buildMetricFeature,
  type MetricFeature,
} from "@/features/metric/feature.js";
import {
  buildMetricCategoryFeature,
  type MetricCategoryFeature,
} from "@/features/metric-category/feature.js";
import type { MetricLogFeature } from "@/features/metric-log/feature.js";
import {
  buildMetricSettingsFeature,
  type MetricSettingsFeature,
} from "@/features/metric-settings/feature.js";
import { buildWiredAuthFeature } from "./auth.js";
import { buildWiredMetricLogFeature } from "./metric-log.js";

/** Every feature the HTTP app serves, each built once and handed to its router (ADR-0072). */
export type AppFeatures = {
  auth: AuthFeature;
  analytics: AnalyticsFeature;
  metric: MetricFeature;
  metricCategory: MetricCategoryFeature;
  metricLog: MetricLogFeature;
  metricSettings: MetricSettingsFeature;
};

/**
 * The features as the HTTP server runs them (ADR-0056, ADR-0072).
 *
 * The one place the app's features are built. A feature with a composition root of
 * its own (auth, metric-log) is built through it, so the server and the worker wire
 * it the same way. One auth instance serves the auth, organization, invite and
 * membership routers. One metric access adapter serves analytics, metric-log and
 * metric-settings: a feature's factory takes another feature's adapter, never
 * imports it (metric-access-wiring D-01). Import a feature here through its
 * `feature.ts` or `public.ts` only.
 *
 * `messageQueue` is what legitimately differs per process: the server passes its
 * publisher, a test passes nothing and gets the no-op queue.
 */
export const buildWiredFeatures = ({
  messageQueue,
}: { messageQueue?: MessageQueuePort } = {}): AppFeatures => {
  const metricAccess = new MetricAccessSequelize();
  return {
    auth: buildWiredAuthFeature({ messageQueue }),
    analytics: buildAnalyticsFeature({ metricAccess }),
    metric: buildMetricFeature(),
    metricCategory: buildMetricCategoryFeature(),
    metricLog: buildWiredMetricLogFeature({ messageQueue, metricAccess }),
    metricSettings: buildMetricSettingsFeature({ metricAccess }),
  };
};
