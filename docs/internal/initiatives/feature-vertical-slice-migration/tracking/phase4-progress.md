## Phase 4 Progress Log

- Timestamp: 2025-12-03T19:05:00Z

### Kickoff Notes

- Initiated Phase 4 work (infrastructure alignment + legacy folder retirement) per `../plans/phase4-plan.md`.
- Confirmed ESLint guardrails already prevent imports from `src/services/**`; `src/routes/**` is now blocked as well, with controller guardrails queued once migrations finish.
- Documented the router factory strategy in `../plans/phase4-router-refactor.md` to guide the migration away from `src/routes/*.routes.ts`.
- Capture structural milestones in `./changelog.md` so release notes/onboarding stay up to date.

### 2025-12-03 – Auth Router Migration

- Added `src/features/auth/infrastructure/http/router.ts` with `createAuthRouter`/`authRouter` exports.
- `src/server.ts` now mounts `/api/v1/auth` via the feature index; `src/features/auth/infrastructure/http/router.ts` removed.
- `src/features/auth/index.ts` re-exports the router so tests/composition roots can import from a single entrypoint.

### 2025-12-03 – Metric Router Migration

- Introduced `src/features/metric/infrastructure/http/router.ts` with `createMetricRouter`/`metricRouter`.
- `src/features/metric/index.ts` now re-exports the router; `src/server.ts` mounts `/api/v1/metrics` from the feature slice.
- Legacy `src/routes/metric.routes.ts` deleted after wiring the feature router.

### 2025-12-03 – Metric Log Router Migration

- Added `src/features/metric-log/infrastructure/http/router.ts` exposing `createMetricLogRouter`/`metricLogRouter`.
- `src/server.ts` now uses the feature router for `/api/v1/metric-logs`; legacy `src/routes/metric-log.routes.ts` removed.
- `src/features/metric-log/index.ts` re-exports the router for tests/composition roots.

### 2025-12-03 – Metric Settings Router Migration

- Created `src/features/metric-settings/infrastructure/http/router.ts` with `createMetricSettingsRouter`/`metricSettingsRouter`.
- `src/server.ts` mounts `/api/v1/metric-settings` via the feature entrypoint; legacy `src/routes/metric-settings.routes.ts` deleted.
- `src/features/metric-settings/index.ts` re-exports the router for composition/test usage.

### 2025-12-03 – Routes Folder Retirement

- Removed the empty `src/routes` directory and dropped the `@routes/*` alias from `jsconfig.json`.
- Added an ESLint `no-restricted-imports` rule for `src/routes/**` (and alias equivalents) to prevent future regressions.

### 2025-12-03 – Router Pattern Documentation

- Updated `docs/internal/initiatives/features/README.md` with the standardized router factory pattern so new slices follow the same structure.

### 2025-12-03 – Controllers Folder Retirement

- Deleted the empty `src/controllers` directory and removed the `@controllers/*` alias from `tsconfig.json`/`jsconfig.json`.
- Extended the ESLint guardrail to block imports from `src/controllers/**`, mirroring the services/routes protections.

### 2025-12-03 – Metric Settings ORM Relocation (Phase 1)

- Moved `metric-settings.model.ts` into `src/features/metric-settings/infrastructure/persistence/models/metric-settings.sequelize.ts`.
- Updated repositories/utilities to import the model directly from the feature slice and deleted the legacy file under the old `src/models` directory.
- Bootstrap logic now references the feature-owned model via `src/infrastructure/db/models.ts`.

### 2025-12-03 – Metric ORM Relocation (Phase 2)

- Relocated `metric.model.ts` into `src/features/metric/infrastructure/persistence/models/metric.sequelize.ts`.
- Updated the bootstrap (`src/infrastructure/db/models.ts`/`types.ts`), mappers, and helpers to import the feature-owned model; deleted the legacy file from `src/models`.
- Metric log/model dependencies now reference the feature path, paving the way for future ORM cleanup.

### 2025-12-03 – Metric Log ORM Relocation (Phase 3)

- Moved `metric-log.model.ts` into `src/features/metric-log/infrastructure/persistence/models/metric-log.sequelize.ts`.
- Updated loaders, types, and all mappers/helpers to reference the feature-owned model; deleted the centralized file.
- Metric feature models now import logs from the feature path, keeping ORM ownership aligned with the slice.

### 2025-12-03 – User ORM Relocation

- Moved `user.model.ts` into `src/features/auth/infrastructure/persistence/models/user.sequelize.ts`.
- Updated loaders, shared types, and user/metric-category mappers to import the feature-owned model; removed the legacy version from `src/models`.
- All remaining ORM artifacts under `src/infrastructure/db` are now the bootstrap helpers + shared type definitions.

### 2025-12-03 – Per-Feature ORM Bootstrap

- Added feature-level `register*/associate*` helpers so each slice wires its Sequelize models explicitly.
- `src/infrastructure/db/models.ts` now simply iterates those helpers to initialize/associate models, keeping a central export for callers without owning model definitions.

### 2025-12-03 – Auth Middleware Alignment

- Introduced `src/features/auth/infrastructure/http/authMiddleware.ts`, so the JWT guard now depends on the feature’s repository/use cases instead of global models.
- `src/features/auth/infrastructure/http/authMiddleware.ts` is now a thin re-export to preserve import paths while the remaining consumers migrate.

### 2025-12-03 – Rate Limiter Consolidation

- Added `src/shared/middleware/rate-limiter.ts`, a feature-aware module that owns global/user/analytics limiters, replacing the old middleware implementation.`
- All routers now import rate limiters via the shared feature module; the legacy middleware file can disappear after consumers fully migrate.

### 2025-12-03 – Validation Middleware Alignment

- Added `src/shared/middleware/validation.ts` so Zod validation lives in a feature-aware module, replacing the legacy middleware implementation.
- Routers/controllers now import `validate` from the shared feature module; the legacy middleware re-export exists only for compatibility.

### 2025-12-03 – Cache Middleware Alignment

- Added `src/shared/middleware/cache.ts` to host the Redis response caching helper, replacing the legacy middleware implementation.
- Metrics, metric logs/settings, and category routers now import `cacheMiddleware` via the shared module, leaving the legacy middleware as a thin re-export until callers are updated.

### 2025-12-03 – Role & PickValidated Alignment

- Added `src/shared/middleware/role.ts` and `src/shared/middleware/validated.ts` so role guards and `pickValidated` live next to other shared middleware.

### 2025-12-03 – Error Handler Alignment

- Added `src/shared/middleware/error.ts` so the global error handler lives alongside other shared middleware.
- `src/shared/middleware/error.ts` exposes the error handler; legacy files have been removed.

### 2025-12-04 – ORM Bootstrap Consolidation

- Removed the deprecated `src/infrastructure/db/sequelize.ts` loader and routed all callers (server, Jest, transaction port, legacy services) through the shared `sequelize` instance exported by `src/config/db.ts`.
- Added caching logic to `src/infrastructure/db/models.ts` so `loadModels()` only registers/associates feature models once even if multiple modules import it; server/bootstrap callers now import the helper from `src/infrastructure/db/models.ts`.
- Updated the remaining imports (`user.sequelize.ts`, metric/metric-log/settings/category models) to depend on `@/infrastructure/db/types` so type-checking no longer references a non-existent `models/types` path.
- Cleaned up `src/utils/token-generator.ts` so it only depends on the auth feature's types instead of mutating the shared db singleton.
- Captured the finalized bootstrap flow in `docs/internal/initiatives/orm-bootstrap.md` and linked it from the feature README so onboarding stays consistent.

### 2025-12-04 – Config & Middleware Alignment

- Switched `src/server.ts`, `jest.setup.ts`, and the `SequelizeTransactionPort` to import `sequelize` + middleware straight from the feature factories, eliminating the last references to the removed db singleton.
- Pruned the legacy includes from `jsconfig.json` so IDE tooling only indexes `src/features/**`, `src/infrastructure/**`, etc.
- Verified `src/services`, `src/controllers`, and `src/routes` remain deleted and noted the change in the checklist so the team stops relying on the removed aliases.

### 2025-12-04 – Metric Category Router Migration

- Added `src/features/metric-category/infrastructure/http/router.ts` with `createMetricCategoryRouter`/`metricCategoryRouter` exports so the slice owns its HTTP wiring.
- Created `src/features/metric-category/index.ts` and updated `src/server.ts` to mount `/api/v1/metric-categories` from the feature entrypoint instead of the legacy `routes.ts`.
- Updated documentation (router refactor plan, checklist, OpenAPI plan, changelog) to point to the new router file and capture the milestone.

### 2025-12-04 – Phase 4 Regression Plan

- Authored `../logs/testing/phase4-test-log.md` describing the environment expectations, suite matrix, and action items for the end-to-end regression run post-router/ORM work.
- Coordinating the DB window and ownership assignments before executing `npm run test:dev`; log will be updated with actual results when the run completes.
- Attempted first `npm run test:dev` run at 12:20 local time; Jest bailed immediately with `ReferenceError: Cannot access 'buildAuthFeature' before initialization` coming from `src/features/auth/infrastructure/http/controller.ts`. Tracking the failure in the test log and will fix the auth bootstrap before re-running.

### 2025-12-04 – Metric Category Migration Blueprint

- Captured the detailed follow-up plan in `docs/internal/initiatives/metric-category-migration-plan.md`, outlining domain/application/infrastructure tasks required to replace the legacy services.
- This plan will drive the final slice migration (entities, ports, repositories, HTTP handlers) once Phase 4 validation is complete.

- ### 2025-12-05 – Feature Builder Decoupling + Regression Run
  - Extracted `build*Feature` factories for auth/metric/metric-settings/metric-log into dedicated `feature.ts` modules so HTTP controllers no longer import from their slice `index.ts` (which re-exports routers). This removed the circular dependency that crashed Jest and simplified test overrides.
  - Hardened `jest.setup.ts` to tolerate mocked `sequelize.query` results from analytics tests by falling back to an empty array during truncation.
  - Executed the full regression suite via `DB_HOST=127.0.0.1 REDIS_REQUIRED=false NODE_ENV=test npm run jest -- --runInBand`; all 24 suites (112 tests) passed, covering analytics/auth/metrics/logs/settings routers plus the new feature wiring.
  - Added `__tests__/docs/swagger.test.ts` so `/api/v1/docs` auth requirements and the `/api/v1/docs/openapi.json` response are now validated automatically.

### 2025-12-05 – Metric Category Feature Bootstrap

- Introduced `src/features/metric-category/feature.ts` plus `MetricCategoryCacheRedis`, and new application use cases (`GetCategory`, `UpdateCategory`, `DeleteCategory`) so the slice owns create/list/get/update/delete logic.
- Rewrote the HTTP controller + router to consume the feature instead of the legacy services; only the dummy endpoint continues to call the legacy generator until a feature-native version exists.

### 2025-12-05 – Metric Category Legacy Retirement

- Deleted the entire `src/features/metric-category/legacies/**` tree and the unused `application/queries` helpers after migrating the dummy endpoint and metric mappers onto the new domain/value objects.
- Updated shared metric mappers/types to reference the feature-owned DTOs instead of the legacy `MetricCategoryLegacy.domain`, so downstream responses (metric detail/library) now rely on the same data source.
- Confirmed Swagger + metric-category suites via `DB_HOST=127.0.0.1 REDIS_REQUIRED=false NODE_ENV=test npm run jest -- __tests__/docs/swagger.test.ts __tests__/metric-category.test.ts --runInBand`.

### Current Inventory

| Area              | Remaining Legacy Artifacts                                                                     | Notes / Owners                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/routes`      | _(removed)_                                                                                    | Folder deleted after migrations; lint guard now blocks imports from `src/routes/**`.                      |
| `src/controllers` | _(removed)_                                                                                    | Folder deleted; future controllers must live inside feature slices.                                       |
| DB bootstrap      | `src/infrastructure/db/models.ts`, `types.ts`                                                  | Only the thin bootstrap + shared type map remain; per-feature helpers handle registration/association.    |
| Shared middleware | `src/shared/middleware/{authMiddleware,rate-limiter,validation,cache,role,validated,error}.ts` | All cross-cutting middleware lives in the shared feature modules; legacy `src/middleware` folder removed. |
| Path aliases      | _(none pending)_                                                                               | `@routes/*`, `@controllers/*`, and `@services/*` have been removed; configs now rely on feature paths.    |

### Immediate Actions

1. Run one more full regression after the next batch of docs/cleanup changes to certify Phase 4 completion.
2. Backfill any remaining documentation (feature READMEs/tests) that referenced the deleted legacy files so future engineers land on the new slice-first guidance.
