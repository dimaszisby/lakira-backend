# Architecture Changelog

- Last updated: 2025-12-03T22:00:00Z

## 2025-12-05 – Feature Builder Decoupling & Regression Run

- Extracted `build*Feature` factories for auth/metric/metric-log/metric-settings into dedicated `feature.ts` modules so HTTP controllers avoid importing from their slice index files (preventing circular dependencies with router exports).
- Updated `jest.setup.ts` to treat mocked `sequelize.query` responses defensively, letting analytics tests spy on the query API without breaking global table truncation.
- Ran the full regression suite via `DB_HOST=127.0.0.1 REDIS_REQUIRED=false NODE_ENV=test npm run jest -- --runInBand`; all 24 suites passed in ~53s (recorded in `../logs/testing/phase4-test-log.md`).
- Bootstrapped the metric category slice (feature builder, Redis cache adapter, CRUD controllers) so `/api/v1/metric-categories` no longer depends on the legacy services; only the dummy endpoint still relies on the legacy generator for now.
- Completed the metric-category migration by replacing the dummy generator/mappers with feature-owned factories and deleting `src/features/metric-category/legacies/**` along with the obsolete `application/queries` helpers.

## 2025-12-04 – ORM Bootstrap Cleanup

- Deleted the legacy `src/infrastructure/db/sequelize.ts` singleton and now compose Sequelize exclusively through `src/config/db.ts` + the cached `loadModels()` helper under `src/infrastructure/db/models.ts`.
- Updated server startup, Jest bootstrap, and the shared transaction port to use the feature-owned factories; auth utilities such as `token-generator` now depend on typed feature models rather than the shared db bag.
- jsconfig/IDE settings no longer reference the removed `src/services`, `src/controllers`, or `src/middleware` folders, keeping tooling aligned with the feature slices.
- Migrated `/api/v1/metric-categories` onto `src/features/metric-category/infrastructure/http/router.ts` so all high-traffic routes now follow the feature router factory pattern.

## 2025-12-03 – Middleware & ORM Alignment

- Retired the legacy `src/middleware` folder; all auth/rate-limit/validation/cache/error/role helpers now live under `src/shared/middleware/*` (documented in `docs/explanation/architecture/shared-middleware.md`). `src/server.ts` imports middleware directly from those modules.
- Introduced feature-level Sequelize bootstrap helpers and a thin composer at `src/infrastructure/db/models.ts`, so every model lives inside its owning slice and is registered explicitly.
- Updated router factories so every HTTP route is mounted through `src/features/*/infrastructure/http/router.ts`.

## 2025-12-02 – Phase 3 Completion

- Finalized auth, metric, metric-log, and metric-settings slices (controllers, repositories, and tests). All legacy services/controllers for those domains have been removed.
