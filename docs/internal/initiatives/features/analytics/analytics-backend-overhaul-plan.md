# Analytics Backend Overhaul Plan

## 1. Purpose & Scope

This plan translates the UX gaps described in `visualization-frontend-analysis.md` into concrete backend deliverables. It focuses on the `/analytics/dashboard` stack (queries, services, caching, schema) so the dashboard can display richer empty states, expose recovery controls, and stay synchronized with metric metadata.

## 2. Background

- Dashboard shows up to 12 metrics with 30d/1d defaults. When no samples fall into the requested window, cards collapse into a non-informative "No data" label.
- The frontend cannot distinguish whether a metric has never been logged, is stale, or simply falls outside the current range. Filters cannot be edited in-place, so recovery requires leaving the page.
- The backend only returns per-range stats and series data. No lifecycle metadata (first/last log) or pagination hints are available. ETag strategy can allow stale metadata to persist in client caches.

## 3. Goals & Success Criteria

1. **Context-rich payloads:** Add lifecycle metadata for each metric so FE can render differentiated empty states and recency cues.
2. **Guided recovery:** Surface range/bucket information and fallback indicators that enable inline filter adjustments.
3. **Resilient caching:** Align ETag and cache invalidation policy with metadata updates to avoid stale dashboards.
4. **Operational safety:** Keep queries performant (respect 400-bucket guardrails) and testable with deterministic fixtures.
5. **Communication-ready:** Provide sufficient documentation for data-contract changes to coordinate FE rollout.

Success is measured by:

- FE receiving new payload fields without extra round-trips.
- Empty metrics now accompanied by rationale (never logged, last activity date, fallback window) in QA builds.
- Cache invalidation triggers when metrics or settings change.

## 4. Gaps & Pain Points

| Gap                                        | Impact                                                   | Required Backend Work                                                       |
| ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| No `lastLogAt`/`totalLogs` info            | FE cannot signal metric freshness                        | Aggregate lifecycle stats per metric within dashboard query                 |
| No fallback or actual range info           | FE cannot tell whether data is missing vs. auto-expanded | Return requested window and actual window per metric                        |
| Missing pagination metadata                | Users cannot see hidden metrics count                    | Compute `meta.totalMetrics` after filtering `showOnDashboard` & `is_active` |
| ETag tied only to payload rows             | Metadata changes stale for up to 5 minutes               | Incorporate metric + settings `updated_at` into ETag hash                   |
| 400-bucket guard prevents auto exploration | FE cannot offer "show last activity" experiences         | Design fallback query that stays within safeguards                          |

## 5. Proposed Backend Enhancements

### 5.1 Data Contract Additions (per metric)

- `lastLogAt: string | null` – ISO timestamp of the most recent log overall.
- `firstLogAt: string | null` – First known log for copy such as “Metric created on …”.
- `totalLogs: number` – Total persisted logs (not limited to window).
- `latestValue: number | null` – Value of the latest log plus `latestBucketStart` to seed FE tooltips.
- `requestedRange: { startISO: string; endISO: string; bucket: string }` – Echo back the inbound filters for clarity.
- `actualRange: { startISO: string; endISO: string; bucket: string }` – Mirrors fallback window when auto-expand occurs; equals requested range otherwise.
- `fallbackRangeUsed: boolean` – Signals FE to annotate charts.

### 5.2 Endpoint-Level Metadata

- `meta.totalMetrics` – Count of metrics eligible for dashboard (after `showOnDashboard/is_active` filters) even if not returned due to `limit`.
- `meta.fallbackMetrics` – Number of metrics where fallback was applied (helps FE message globally).
- `sync.etagSeed` – Hash of concatenated `metric.updated_at`, `metric_settings.updated_at`, `metric_visualization.updated_at` to guarantee invalidation when metadata changes.

### 5.3 Query Logic

1. **Primary fetch** – Existing aggregated query limited to requested window/bucket.
2. **Lifecycle aggregation** – Batched query per metric ID computing `min(timestamp)`, `max(timestamp)`, `count(*)`, and `max_by(value, timestamp)` for `latestValue`. Prefer a single SQL CTE rather than per-metric round-trips.
3. **Fallback selection** – When `series` is empty:
   - Compute `fallbackEnd = lastLogAt ?? now()` and `fallbackStart = max(fallbackEnd - guardRange, fallbackEnd - 180d)`.
   - Respect 400-bucket guard by coarsening bucket (e.g., escalate 1d → 7d) if needed.
   - Populate `actualRange` with fallback window and refill `series` using same aggregation pipeline.
   - Set `fallbackRangeUsed=true` and capture `fallbackStrategy` (optional string for observability).

### 5.4 Caching Strategy

- Update ETag computation: `etag = hash(resultChecksum + metadataVersionChecksum)`.
- Expose `Cache-Control: max-age=60` aligned with FE `staleTime`. Document that FE should rely on ETag to avoid stale metadata.
- Recompute ETag whenever lifecycle aggregations change; ensure fallback queries also influence checksum so FE refreshes when metrics leave/enter fallback state.

## 6. Implementation Roadmap

| Phase                            | Timeline  | Key Tasks                                                                                                                                                          | Owner                    |
| -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Phase 0 – Alignment              | Week 0    | Confirm FE payload contract, update OpenAPI schema draft, document copy needs                                                                                      | Backend + Frontend leads |
| Phase 1 – Schema & SQL prep      | Week 1    | Extend `visualization.dashboard.sql.ts` to produce lifecycle metadata CTEs; write migrations if new indices needed (e.g., on `metric_logs(metric_id, created_at)`) | Data Platform            |
| Phase 2 – Service updates        | Week 2    | Update `GetDashboardVisualization.ts` to join lifecycle CTE, build fallback range logic, assemble new DTO                                                          | Analytics Services       |
| Phase 3 – API contract & caching | Week 3    | Update OpenAPI spec, adjust ETag generator (likely metric feature HTTP middleware under `src/features/metric/infrastructure/http`), add pagination metadata        | Platform Infra           |
| Phase 4 – Testing & rollout      | Weeks 4-5 | Add integration tests covering empty metrics, fallback, ETag invalidation; release behind toggled version (`?v=2`) for FE to consume                               | QA + Release             |

- **Contract versioning:** `/analytics/dashboard` now accepts optional query parameter `v` (default `1`, send `2` for lifecycle metadata). Documented in `docs/reference/api/lakira-backend-openapi.json`.
- **Sample payload:** `docs/features/analytics/dashboard-v2-sample-response.json` illustrates the v2 shape, including fallback metadata and sync etag seed.
- **Copy alignment:** UX copy for all dashboard empty states captured in `docs/features/analytics/dashboard-empty-state-copy.md` for FE reference.
- **OpenAPI updates:** Component schema `DashboardVisualizationResponse` now enumerates new metric-level fields plus `meta.totalMetrics`, `meta.fallbackMetrics`, and `sync.etagSeed`.

## 8. Phase 1 – Schema, SQL & Performance Foundations (Completed)

- **Index audit:** See `docs/features/analytics/metric-logs-index-audit.md` confirming composite index `ix_metric_logs_metric_id_logged_at` satisfies current access patterns; no new physical schema required yet.
- **Lifecycle SQL builder:** `src/features/analytics/infrastructure/sql/visualization.dashboard.sql.ts` now exports `buildDashboardLifecycleSQL`, producing `firstLogAt`, `lastLogAt`, `totalLogs`, and `latestBucketStart` aggregates for each metric.
- **Fallback helper utilities:** Added `src/features/analytics/domain/fallback-range.ts` with guard-aware range computation + bucket coarsening logic to reuse during service implementation.
- **Performance snapshot:** `docs/features/analytics/dashboard-lifecycle-performance.md` captures `EXPLAIN ANALYZE` results (≈6 ms on 2k-row sample) for the lifecycle CTE to benchmark future regressions.

- **Service response enrichment:** `GetDashboardVisualization.ts` now hydrates `lastLogAt`, `firstLogAt`, `totalLogs`, `latestValue`, `latestBucketStart`, per-metric `requestedRange`, and `actualRange` using the lifecycle CTE output.
- **Fallback orchestration:** Integrated `computeFallbackRange` to auto-expand empty metrics using guard-aware buckets; fallback series fetched on-demand and surfaced via `fallbackRangeUsed` + `fallbackStrategy`.
- **DTO metadata:** Dashboard payload now includes `meta.totalMetrics`, `meta.fallbackMetrics`, and `sync.etagSeed` alongside updated `items` schema, aligning with the OpenAPI v2 contract.
- **Observability hooks:** Structured log `analytics.dashboard.fallback_range_used` fires whenever backend auto-expands a metric, providing traceability for UX tuning. Details recorded in `docs/features/analytics/dashboard-service-layer-notes.md`.

- **Version-aware cache keys:** `vizDashKey` now ingests a metadata fingerprint (metric/settings/category `updated_at`), preventing Redis from serving stale payloads when names/categories evolve.
- **ETag derivation:** `sync.etagSeed` hashes the cache key plus version fingerprint, and HTTP `ETag` headers reuse this seed for deterministic 304 handling.
- **Cache-Control policy:** `handleGetDashboardVisualization` emits `Cache-Control: private, max-age=<VIZ_CACHE_MAX_AGE_SEC>, stale-while-revalidate=<VIZ_CACHE_STALE_SEC>` to align with the five-minute React Query caching strategy.
- **Validation doc:** `docs/features/analytics/dashboard-etag-validation.md` outlines curl-based steps QA can execute to confirm 200→304 flows and metadata invalidation.

- **Unit coverage:** `__tests__/unit/features/analytics/domain/fallback-range.test.ts` locks expected behavior for `computeFallbackRange` (null guard, bucket coarsening, guard clamping).
- **Service integration tests:** `__tests__/unit/features/analytics/application/GetDashboardVisualization.service.test.ts` stubs Sequelize + cache layers to validate lifecycle metadata, fallback orchestration, and `sync.etagSeed` changes when metadata timestamps update.
- **Manual validation:** `docs/features/analytics/dashboard-etag-validation.md` captures curl-based steps for QA to exercise 200→304 flows and fallback logging until automated HTTP tests are added.
- **OpenAPI refresh:** `docs/reference/api/lakira-backend-openapi.json` regenerated via `npm run docs:openapi:generate`, ensuring the published spec reflects the v2 dashboard contract.
- **Remaining work:** extend suite with OpenAPI regression tests (Schemathesis) once backend endpoint is deployed to a test DB.

## 12. Testing Strategy

- **Unit:** Cover helper functions that determine fallback buckets, range coarsening, and metadata serialization.
- **Integration:** Add Jest/TS tests hitting a real DB fixture to assert: (a) lifecycle metadata correctness; (b) fallback triggered when range empty; (c) ETag changes when metric metadata updates.
- **Contract:** Generate updated OpenAPI docs and use Schemathesis/Postman tests to ensure FE clients can parse the new structures.
- **Performance:** Run EXPLAIN ANALYZE on lifecycle query to keep p95 latency within current SLA (target < 300ms per request at 12 metrics).

## 13. Operational & Observability Considerations

- Emit structured logs whenever fallback is applied (`metricId`, requested vs. actual range, bucket adjustments) for future tuning.
- Expose a Prometheus counter `dashboard_fallback_total` to quantify frequency.
- Create dashboard alerts if fallback rate spikes (indicating users routinely exceed default ranges).
- Update runbooks with new troubleshooting steps (e.g., verifying lifecycle CTE results).

## 14. Risks & Mitigations

| Risk                                     | Mitigation                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Lifecycle aggregates slow query          | Pre-compute partial aggregates or add covering indexes (`metric_logs(metric_id, bucket_start)`).                  |
| Fallback overrides surprise users        | Include both ranges in API so FE can visibly label fallback state and provide opt-out query flag for power users. |
| Larger payload size                      | Keep lifecycle metadata concise (< 200 bytes per metric) and gzip responses.                                      |
| Cache churn from frequent metadata edits | Keep ETag seed stable by rounding timestamps to seconds and avoiding volatile fields.                             |

## 15. Next Actions

1. Layer contract/Schemathesis tests on top of the updated OpenAPI schema and capture results for QA sign-off.
2. Coordinate with Platform Infra on Prometheus counters / dashboards for fallback frequency before GA launch.
3. Share the new Cache-Control + ETag behavior with frontend so they can adjust their `etagCache` strategy (`sync.etagSeed` usage).
4. Prepare release documentation (runbook updates + rollout plan) ahead of Phase 4 testing.
