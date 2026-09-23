import {
  metricRouter,
  createMetricRouter,
} from "./infrastructure/http/router.js";
export { buildMetricFeature } from "./feature.js";
export { metricRouter, createMetricRouter };

// The cross-feature surface; see public.ts.
export * from "./public.js";
