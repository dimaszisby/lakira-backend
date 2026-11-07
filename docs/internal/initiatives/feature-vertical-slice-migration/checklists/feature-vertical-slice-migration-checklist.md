# Feature Vertical Slice Migration Checklist

- Timestamp: 2025-12-02T14:09:29Z

## Governance

- [ ] Publish feature-foldering guidelines in `docs/internal/initiatives/features/README.md`.
- [ ] Announce migration plan to the team and capture Q&A.
- [x] Add lint rule (or manual review checklist) preventing new code in `src/services`. _(2025-12-03 — `eslint.config.mjs` now blocks `src/services/**` imports via `no-restricted-imports`.)_

## Phase 0 – Preparation

- [x] Create template README for every feature describing domain/application/infrastructure expectations. _(2025-12-02 — see `docs/internal/initiatives/features/README.md`)_
- [x] Identify owners for each domain (metrics, metric logs, auth, analytics, settings). _(2025-12-02 — see `domain-ownership-matrix.md`)_
- [x] Tag existing tickets that must pause until their target feature is migrated. _(2025-12-02 — documented in `migration-ticket-triage.md`; add label `blocked-by-vertical-slice` in tracker)_

## Phase 1 – Metric Feature

- [x] Scaffold `src/features/metric/{domain,application,infrastructure}` directories with index entrypoint. _(2025-12-02 — see `src/features/metric/`)_
- [x] Move business logic from `src/services/metric.service.ts` into use cases and aggregates. _(2025-12-02 — `CreateMetric` use case now drives POST /metrics)`_
- [x] Implement Sequelize repository + cache port under `src/features/metric/infrastructure`. _(2025-12-02 — repo + settings port + redis cache adapters added)_
- [x] Relocate HTTP controllers into the feature and update `src/routes` to import them. _(2025-12-02 — new handlers live in `src/features/metric/infrastructure/http/controller.ts`; `src/routes/metric.routes.ts` now references them)_
- [x] Add unit tests for domain/application (Metric entity + CreateMetric use case). _(2025-12-02 — see `__tests__/features/metric/**`)_
- [x] Add integration tests for repository/controller. _(2025-12-02 — see `__tests__/features/metric/infrastructure/**` for repo + HTTP handlers)_
- [x] Remove or deprecate old metric service exports. _(2025-12-02 — `src/services/metric.service.ts` removed; controllers now use feature use cases)_

## Phase 2 – Metric Log Feature

- [x] Scaffold `src/features/metric-log` slice mirroring Metric structure and add README. _(2025-12-02)_
- [x] Implement create log use case and route integration. _(2025-12-02 — POST /metric-logs uses feature use case + adapters)_
- [x] Move log detail/update/delete endpoints onto feature use cases. _(2025-12-02)_
- [x] Port listing/stats/dummy endpoints into the feature. _(2025-12-02 — `ListMetricLogs`, stats, and dummy use cases added)_
- [x] Extract log-specific logic from `src/services/metric-log.service.ts` into use cases. _(2025-12-02 — service removed)_
- [x] Define cross-feature ports (e.g., metric existence checks) instead of direct model imports. _(2025-12-02 — `MetricAccessPort` + cache port wired)_
- [x] Update HTTP routes/controllers to live within the feature. _(2025-12-02 — routes import `src/features/metric-log/infrastructure/http/controller.ts`)_
- [x] Cover new code with unit + integration tests; ensure legacy endpoints still pass regression suite. _(2025-12-02 — see `__tests__/features/metric-log/**`; e2e suite to be rerun in Phase 2 test log)_

## Phase 3 – Other Domains

- [x] Migrate Auth into `src/features/auth` with its own domain/application/infrastructure stack. _(2025-12-03 — slice scaffolded with use cases + adapters; requires follow-up tests)_
- [x] Backfill Auth feature unit + integration coverage. _(2025-12-03 — `NODE_ENV=test SKIP_DB_LIFECYCLE=true npm run jest -- **tests**/features/auth/\*\*/_.test.ts`; see `../logs/testing/phase3-test-log.md`)\*
- [x] Migrate Metric Settings into a dedicated slice (`src/features/metric-settings/**`). _(2025-12-03 — controllers/routes now import the feature factory; legacy controller/service removed; see docs/README)_
- [x] Move Metric Settings cursor listing behind the feature repository/use case. _(2025-12-03 — `listMetricSettingsViaCursor` replaced with repository-backed use case)_
- [x] Move `/api/v1/metrics/:metricId/trends` onto analytics feature handlers. _(2025-12-03 — route now uses `handleMetricTrend`; `src/controllers/trend.controller.ts` removed)_
- [x] Route all analytics visualization/dashboard endpoints through the feature slice. _(2025-12-03 — `src/features/analytics/infrastructure/http/visualization.controller.ts` and router own the API; legacy controller removed)_
- [x] Repeat the slice migration for metric settings, analytics, and remaining services. _(2025-12-03 — metric settings + analytics routes/controllers now reside inside their slices; legacy services removed.)_
- [x] Verify no consumers import from `src/services`; provide codemod or lint to block regressions. _(2025-12-03 — manual `rg` clean + lint guard ensures future enforcement.)_

## Phase 4 – Infrastructure Alignment

- [x] Capture kickoff inventory and tracking doc. _(2025-12-03 — see `../tracking/phase4-progress.md` for remaining routes/controllers/models/middleware.)_
- [x] Define per-feature router factory pattern. _(2025-12-03 — documented in `../plans/phase4-router-refactor.md`.)_
- [x] Migrate Auth router to feature entrypoint. _(2025-12-03 — `src/server.ts` now imports `/api/v1/auth` router from `src/features/auth`.)_
- [x] Migrate Metric router to feature entrypoint. _(2025-12-03 — `/api/v1/metrics` now mounts `metricRouter` from `src/features/metric`.)_
- [x] Migrate Metric Log router to feature entrypoint. _(2025-12-03 — `/api/v1/metric-logs` now mounts `metricLogRouter` from `src/features/metric-log`.)_
- [x] Migrate Metric Settings router to feature entrypoint. _(2025-12-03 — `/api/v1/metric-settings` now mounts `metricSettingsRouter` from `src/features/metric-settings`.)_
- [x] Migrate Metric Category router to feature entrypoint. _(2025-12-04 — `/api/v1/metric-categories` now mounts `metricCategoryRouter` from `src/features/metric-category`.)_
- [x] Remove legacy `src/routes` folder, drop `@routes/*` alias, and add ESLint guardrails. _(2025-12-03 — folder deleted, jsconfig alias removed, `no-restricted-imports` blocks `src/routes/**`.)_
- [x] Remove legacy `src/controllers` folder, drop `@controllers/*` alias, and add ESLint guardrails. _(2025-12-03 — folder deleted, ts/js config cleaned, `no-restricted-imports` blocks `src/controllers/**`.)_
- [x] Remove legacy `@services/*` alias once service folder retirement is complete. _(2025-12-03 — config aliases cleaned; ESLint already blocks `src/services/**`.)_
- [x] Introduce per-feature ORM bootstrap helpers and keep `src/infrastructure/db/models.ts` as a thin composer. _(2025-12-03 — feature-level register/associate helpers added.)_
- [x] Relocate auth middleware into the feature slice and re-export for compatibility. _(2025-12-03 — `src/features/auth/infrastructure/http/authMiddleware.ts` now owns the JWT guard.)_
- [x] Move rate limiter middleware into a shared feature module. _(2025-12-03 — routers import from `src/shared/middleware/rate-limiter.ts`.)_
- [x] Move Zod validation middleware into a shared feature module. _(2025-12-03 — routers import `validate` from `src/shared/middleware/validation.ts`.)_
- [x] Move cache middleware into a shared feature module. _(2025-12-03 — routers import from `src/shared/middleware/cache.ts`.)_
- [x] Move role guard and `pickValidated` helpers into shared feature modules. _(2025-12-03 — see `src/shared/middleware/role.ts` and `src/shared/middleware/validated.ts`.)_
- [x] Document shared middleware conventions. _(2025-12-03 — see `docs/explanation/architecture/shared-middleware.md`.)_
- [x] Move error handler into shared feature module. _(2025-12-03 — see `src/shared/middleware/error.ts`.)_
- [x] Decide on strategy for ORM/model placement (shared lib vs. per-feature wrappers) and implement it. _(2025-12-04 — Removed the legacy `src/infrastructure/db/sequelize.ts`, centralized registration/caching in `src/infrastructure/db/models.ts`, and updated server/tests to rely on the per-feature register/associate helpers.)_
- [x] Update middleware/config to resolve dependencies via feature factories. _(2025-12-04 — `src/server.ts`, Jest setup, and the Sequelize transaction port now import `sequelize` + middleware directly from feature slices; `token-generator` no longer reaches into the old db singleton.)_
- [x] Archive or delete legacy folders (`src/services`, `src/controllers`, `src/routes`) once empty, then remove related path aliases. _(2025-12-04 — Verified the folders remain removed and cleaned `jsconfig.json` includes so IDE tooling only references `src/features/**` + shared infrastructure.)_
- [x] Run Phase 4 regression suites and log the results. _(2025-12-05 — Full suite executed via `DB_HOST=127.0.0.1 REDIS_REQUIRED=false NODE_ENV=test npm run jest -- --runInBand`; see `phase4-test-log.md`.)_
- [x] Migrate metric category services/controllers into domain + application layers. _(2025-12-05 — Legacy folder deleted; controllers/use cases/dummy generator now live under `src/features/metric-category/**`.)_

## Verification & Documentation

- [x] Run full test suite after each domain migration. _(2025-12-02 — see `../logs/testing/phase1-test-log.md`)_
- [x] Update `docs/internal/initiatives/features/<feature>/README.md` once the slice is stable. _(2025-12-03 — auth README now documents controllers + testing strategy)_
- [ ] Capture learnings/incidents in `docs/internal/incidents` referencing timestamps.
- [ ] Review this checklist periodically and tick off completed items with dates + owners.
