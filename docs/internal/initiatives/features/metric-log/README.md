# Metric Log Feature Module

- Last updated: 2025-12-03T21:20:00Z

## Context

- All metric-log CRUD, cursor listing, stats, and dummy generation flows now live inside `src/features/metric-log`. The legacy service has been removed, and HTTP routes import handlers from the feature module.
- Capabilities: CRUD APIs, cursor pagination (`ListMetricLogs`), stats endpoint, dummy log generators.
- Dependencies: metric ownership checks, Redis cache, analytics cache invalidation; DTO + schema definitions now live inside the feature so shared layers only consume the exported mappers.

## Migration Goals

1. Introduce a feature slice under `src/features/metric-log` with `domain`, `application`, and `infrastructure` layers.
2. Model `MetricLog` as a domain entity plus repository contract so CRUD flows do not rely on Sequelize models directly.
3. Provide application use cases for create/update/delete/detail/list, and ports for metric ownership + cache invalidation.
4. Relocate HTTP controllers/routes into the feature and export routers to `src/routes`.
5. Add unit/integration tests mirroring the pattern established for the Metric feature.

## Work Breakdown

- **Domain**: create `MetricLog` entity and repository contract.
- **Application**: design ports for metric access + cache, implement CRUD use cases and cursor listing query.
- **Infrastructure**:
  - `MetricLogRepoSequelize`, `MetricLogCacheRedis`, and `MetricAccessSequelize` provide adapters.
  - **ORM ownership:** the Sequelize model now lives in `src/features/metric-log/infrastructure/persistence/models/metric-log.sequelize.ts` so the slice controls its persistence shape (registration flows through `src/infrastructure/db/models.ts`).
  - HTTP handlers live in `src/features/metric-log/infrastructure/http/controller.ts`; the router factory (`router.ts`) exports `createMetricLogRouter`/`metricLogRouter`, which `src/server.ts` consumes directly.
  - Stats and dummy log endpoints still call legacy service helpers pending future use cases.
- **Testing**:
  - Unit: see `__tests__/features/metric-log/domain` and `.../application`.
  - Integration: repo + HTTP handler tests live under `__tests__/features/metric-log/infrastructure`.
  - Legacy end-to-end suite (`__tests__/metric-log.test.ts`) still exercises the full API until listing/stats are migrated.

## Risks / Notes

- Cross-feature dependency (metrics) requires a clean port to avoid circular imports.
- Cursor query currently resides in `src/features/metric-log/application/queries/ListMetricLogs.ts` as the `ListMetricLogs` use case backed by a read port; ensure new implementation stays consistent with audit requirements.
