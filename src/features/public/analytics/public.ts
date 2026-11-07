/**
 * Analytics' cross-feature surface.
 *
 * Deliberately narrow, and free of the router: importing `index.ts` loads the HTTP
 * stack (express, the auth middleware, every rate limiter), which the worker must
 * not pay for. See ADR-0045 and ADR-0056.
 */
export { AnalyticsVisualizationInvalidationAdapter } from "./infrastructure/cache/VisualizationInvalidationAdapter.js";
