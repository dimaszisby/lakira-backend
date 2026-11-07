# Metric Settings Feature Module

- Last updated: 2025-12-03T07:12:00Z

## Context

- Scope: CRUD + goal/display mutations for metric settings, plus cursor-based listing.
- Legacy controllers/services have been retired; HTTP routes now call feature controllers in `src/features/metric-settings/infrastructure/http/controller.ts`.
- Request/response DTOs, Zod schemas, and HTTP mappers are fully owned by the feature (no shared `@/types` dependencies).

## Domain Model

- Aggregate: `MetricSettings` (`src/features/metric-settings/domain/entities/MetricSettings.ts`) enforces goal/timeframe/alert invariants and keeps display options normalized.
- Repository contract: `MetricSettingsRepository` ensures ownership checks happen inside the feature boundary and returns aggregates.

## Application Layer

- Use cases (`src/features/metric-settings/application/use-cases/`):
  - `CreateMetricSettings`, `UpdateMetricSettings`, `DeleteMetricSettings`
  - `UpdateGoalAchievement`, `UpdateDisplayOptions`, `GetMetricSettings`
  - `ListMetricSettingsViaCursor` (replaces the raw Sequelize query file).
- Ports:
  - `MetricAccessPort` ensures users own the parent metric.
  - `CacheInvalidationPort` centralizes Redis key invalidation.
- Cursor listing now runs through the repository (`MetricSettingsRepository.listByCursor`), so controllers no longer import shared Sequelize helpers.

## Infrastructure Layer

- Persistence: `MetricSettingsRepositorySequelize` maps aggregates to Sequelize models and joins `Metric` for ownership.
- Providers: `MetricSettingsCacheInvalidator` wraps Redis helpers; `MetricAccessSequelize` delegates to `validateMetricAccess`.
- HTTP: Controller wraps use cases + Zod-validated payloads; exposes `overrideMetricSettingsFeature` for tests.

## Testing

- Feature-level Jest command: `NODE_ENV=test SKIP_DB_LIFECYCLE=true npm run jest -- tests/features/metric-settings.test.ts` (requires Postgres reachable at `DB_HOST`).
- Domain unit tests: `NODE_ENV=test SKIP_DB_LIFECYCLE=true npm run jest -- __tests__/features/metric-settings/domain/MetricSettings.test.ts`.
- Controller + repository tests rely on overriding the feature factory; cursor query tests still live in the legacy e2e file.

## TODO / Follow-ups

- Move cursor query off the shared `models` import once a repository abstraction for listing is ready.
- Add integration tests for cache invalidation once Redis test doubles are available.
