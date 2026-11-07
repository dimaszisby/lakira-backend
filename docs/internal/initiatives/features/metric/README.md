# Metric Feature Module

- Last updated: 2025-12-03T21:00:00Z

## Context

- Scope: CRUD for user metrics, cursor-based listing, dummy data generation, and aggregation hooks (trends/analytics).
- Related tickets: EP-219 (endpoint overhaul), MS-104 dependency (settings loadout cap), AN-88 (analytics dashboards).

## Domain Model

- Aggregate: `Metric` (`src/features/metric/domain/entities/Metric.ts`) enforcing name/unit length, description caps, category transitions, and soft delete semantics.
- Repository contract: `MetricRepository` exposes `existsByName`, `categoryExists`, and `create`.
- Future TODO: add domain events for `MetricCreated` to notify analytics + settings modules.

## Application Layer

- Use cases:
  - `CreateMetric`, `UpdateMetric`, `DeleteMetric`, and `GenerateDummyMetrics` orchestrate writes/caching (`src/features/metric/application/use-cases/`).
  - `GetMetricDetail` and `ListMetrics` now consume the shared `MetricReadRepository` for detail + cursor pagination.
- Ports:
  - `MetricSettingsPort` ensures default settings row creation.
  - `CachePort` invalidates list/detail caches.
  - `TransactionPort` abstracts Sequelize transactions.
- Cursor listing + detail logic now use the read repository; mutation flows delegate to repositories instead of shared helpers.

## Infrastructure Layer

- Persistence:
  - `MetricRepoSequelize` persists aggregates via Sequelize models and enforces ownership checks.
  - `MetricReadRepoSequelize` implements the read port (cursor pagination + detail includes).
  - `MetricSettingsPortSequelize` writes default settings rows using existing model defaults.
  - `SequelizeTransactionPort` wraps `db.sequelize.transaction`.
  - **ORM ownership:** `metric.sequelize.ts` now lives inside `src/features/metric/infrastructure/persistence/models/`, so this feature owns its Sequelize model (registered via the shared helper in `src/infrastructure/db/models.ts`).
- Cache:
  - `MetricCacheRedis` invalidates list/detail cache keys (`metrics:*`, `metric:*`).
- HTTP:
  - Controllers now live in `src/features/metric/infrastructure/http/controller.ts`.
  - Routers follow the feature-factory pattern (`router.ts` + exports via `src/features/metric/index.ts`); `src/server.ts` mounts `/api/v1/metrics` directly from the feature.

## Testing Strategy

- Unit: `__tests__/features/metric/domain/Metric.test.ts` covers entity invariants; `__tests__/features/metric/application/CreateMetric.test.ts` covers the create use case.
- Integration: `__tests__/features/metric/infrastructure/persistence/MetricRepoSequelize.test.ts` validates the Sequelize repo wiring, and `__tests__/features/metric/infrastructure/http/controller.test.ts` exercises the HTTP handlers with mocked dependencies. End-to-end tests against a real DB are still pending.
- Manual/regression: rely on existing Postman suite until the remaining automated tests land.

## Operational Notes

- Cache invalidation logs tag `[CACHE]` (shared with legacy service); monitor for failures.
- Transactions rely on shared Sequelize instance; if cloning connections for workers, wire new transaction port accordingly.
- Known gaps:
  - List/detail/update/delete still use legacy services.
  - No dedicated metric feature logger yet.
