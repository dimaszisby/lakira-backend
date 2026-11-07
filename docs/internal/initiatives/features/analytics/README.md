# Analytics Feature Module

- Last updated: 2025-12-06T13:45:00Z

## Context

- Scope: Visualization API (metric trends + dashboard feeds) backed by time-bucket aggregations.
- Entrypoints now live entirely under `src/features/analytics` and are consumed from `src/server.ts` / `src/routes/metric.routes.ts`.

## Structure

- **Domain**: `src/features/analytics/domain/` describes bucket/fill helpers.
- **Application**: Query classes (`GetVisualization`, `GetDashboardVisualization`, `GetMetricTrend`) live under `application/queries/` and depend on the new `VisualizationReadRepository`.
- **Infrastructure**: `infrastructure/persistence/VisualizationReadRepoSequelize.ts` executes the raw SQL + fallback logic, while `infrastructure/cache/VisualizationCacheRedis.ts` implements the cache port. HTTP handlers now live in `infrastructure/http`.

## Recent Changes

- `/api/v1/metrics/:metricId/trends` now calls `handleMetricTrend` (feature controller) which delegates to `getMetricTrend`.
- Visualization/dashboard routes already use the same controller layer; repository + cache ports were introduced to keep Sequelize/Redis out of the application layer.

## Testing

- Visualization endpoints currently rely on the integration suite at `tests/features/metric-settings.test.ts` for regression until dedicated analytics specs are added.
- Run full backend tests (once Docker DB is available): `npm run test:dev`.

## Follow-ups

- Add analytics-specific Jest suites targeting SQL/caching behavior.
- Move raw SQL queries behind a repository interface similar to other features.
