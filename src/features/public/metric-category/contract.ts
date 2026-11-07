/**
 * Metric-category's contract: what other features' domain and application layers may take.
 *
 * Domain types only, re-exported from this feature's own domain. ESLint holds this file to the
 * domain's rules, and refuses an inner layer importing any feature's `public.ts`, which exports
 * infrastructure. See ADR-0078.
 */
export type { MetricCategory } from "./domain/entities/MetricCategory.js";
