/**
 * Metric's cross-feature surface.
 *
 * Separate from `index.ts` because that barrel eagerly constructs this feature's
 * routers, which pulls the composition root and, transitively, sibling features. A
 * sibling importing through `index.ts` is evaluated mid-cycle and receives
 * `undefined` — seen as "Route.post() requires a callback function but got [object
 * Undefined]". This module imports no routers and no feature.ts, so it has no cycle.
 * See docs/internal/initiatives/feature-boundaries/decisions.md D-05.
 */
export { MetricAccessSequelize } from "./infrastructure/providers/MetricAccessSequelize.js";
