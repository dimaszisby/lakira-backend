/**
 * Metric-log's cross-feature surface.
 *
 * Other features import this, never `index.ts` or `feature.ts` — those are the
 * composition root, for src/server.ts only, and ESLint rejects a sibling importing
 * them. It is deliberately narrow: only what a sibling genuinely needs. (It once also
 * dodged an import cycle; importing any feature module now constructs nothing.)
 * See ADR-0045.
 */
export { toMetricLogResponseDTO } from "./infrastructure/http/dto.js";
export { toDomainMetricLog } from "./infrastructure/persistence/mappers/MetricLogReadMapper.js";
