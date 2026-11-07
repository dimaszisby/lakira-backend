# Feature Vertical Slice Migration Plan

- Timestamp: 2025-12-02T14:09:29Z

## Executive Summary

- The codebase currently mixes feature-based folders (`src/features/*`) with legacy type-based folders (`src/controllers`, `src/services`, `src/routes`, etc.).
- Metric Category is the only feature that already follows a layered slice (`domain`, `application`, `infrastructure`, `legacies`).
- Goal: converge the rest of the domains on the same vertical slice pattern so the app is ready for deeper DDD adoption without blocking day-to-day delivery.

## Current Landscape

- **Routing/Presentation**: HTTP routes and controllers remain centralized (`src/routes`, `src/controllers`), referencing services directly.
- **Application Logic**: Business workflows live mostly in `src/services/*.service.ts`; caching and side effects are embedded there.
- **Domain Modeling**: Entities/value objects exist for Metric Category only (`src/features/metric-category/domain`). Other domains rely on Sequelize models and DTOs.
- **Infrastructure**: Sequelize models/glue originally lived under `src/models` and were consumed directly from services; the new per-feature bootstrap under `src/infrastructure/db/models.ts` is replacing that pattern to keep boundaries clear.
- **Testing**: Testing docs live under `docs/tests`, but automated tests still align with the old structure (e.g., `__tests__` focuses on services/controllers).

## Objectives

1. Restructure high-touch domains (Metrics, Metric Logs, Auth) into feature slices mirroring Metric Category.
2. Gradually move ingress/egress adapters (HTTP controllers, routes, caches, queues) inside each feature’s infrastructure folder.
3. Introduce consistent composition roots so the rest of the app resolves dependencies through feature factories rather than reaching into shared service folders.
4. Maintain production stability by migrating feature by feature with compatibility layers.

## Non-Goals

- No full DDD rewrite (rich aggregates, domain events) during this phase.
- No ORM swap or database schema redesign.
- No immediate removal of legacy folders; they will shrink organically as features migrate.

## Guiding Principles

- **Slice by business capability**: each feature owns its domain/application/infrastructure boundaries.
- **Dependencies point inward**: infrastructure depends on application, application depends on domain.
- **Adapters stay thin**: HTTP, queue, and cache adapters only translate protocols and delegate to use cases.
- **Incremental migration**: maintain compatibility (e.g., legacy service proxies) until all consumers switch to the new slice.
- **Test at multiple levels**: unit tests alongside domain/application code, integration tests for adapters.

## Phased Approach

### Phase 0 – Preparation

1. Document naming conventions (done in this file) and communicate structure expectations.
2. Add feature README template under `docs/internal/initiatives/features/` describing required folders/tests.
3. Introduce lint rules or simple codemods that forbid direct imports from `src/services` once a feature is migrated.

### Phase 1 – Metric Feature Migration

1. Create `src/features/metric/{domain,application,infrastructure}` scaffolding.
2. Move domain logic from `src/services/metric.service.ts` into aggregates/value objects; expose use cases mirroring current service API.
3. Build infrastructure adapters: Sequelize repo (wrapping `models.Metric`), cache port, HTTP controller housed within the feature.
4. Update routes to call the feature controller; keep thin compatibility exports for old callers if needed.
5. Write smoke tests for use cases and integration tests for repo/controller boundaries.

### Phase 2 – Metric Log Feature Migration

1. Repeat the same template for Metric Logs, paying attention to cross-feature dependencies (logs reference metrics/categories).
2. Define application ports for cross-feature reads (e.g., metric existence checks) to avoid direct model access.
3. Enhance cache invalidation helpers and share them through application ports.

### Phase 3 – Auth and Remaining Domains

1. Move auth logic into `src/features/auth` with clear domain/application boundaries.
2. Continue migrating ancillary domains (metric settings, analytics, trends) until `src/services` only holds transitional shims.
3. Retire obsolete folders or keep them as thin proxies directing callers to the new features.

### Phase 4 – Infrastructure Harmonization

1. Relocate shared ORM definitions into each feature (or provide a shared `src/infrastructure/orm` library imported by feature repositories).
2. Align shared middlewares/config so they consume feature factories rather than services.
3. Update documentation and onboarding materials to reflect the final structure.

## Risks & Mitigations

- **Risk**: Mixed dependency graph while migrations are in progress.
  - _Mitigation_: enforce a rule that legacy layers can depend on new features but not vice versa.
- **Risk**: Duplicate logic during migration phases.
  - _Mitigation_: add integration tests covering both old and new paths until legacy code is removed.
- **Risk**: Developer confusion about file locations.
  - _Mitigation_: provide a reference diagram and README per feature, keep documents updated in `docs/internal/initiatives/features/`.

## Milestones & Deliverables

1. **M1 (Week 1)**: Metric feature scaffolding merged, controllers/routes pointing to feature use cases.
2. **M2 (Week 3)**: Metric logs migrated and integrated tests passing.
3. **M3 (Week 5)**: Auth + remaining high-traffic domains sliced; deprecate `src/services`.
4. **M4 (Week 6)**: Documentation updated; legacy folders archived or removed.

## Communication & Tracking

- Track progress via the checklist companion doc (`../checklists/feature-vertical-slice-migration-checklist.md`).
- Surface blockers/incidents in `docs/internal/incidents` when migrations affect production.
- Share weekly status updates referencing timestamps to maintain auditability.

## Test Environment Notes

- `npm run test:dev` is the canonical developer entry point because it injects `DB_HOST=127.0.0.1 REDIS_REQUIRED=false NODE_ENV=test` before spawning Jest. That mirrors the docker-compose network but points Sequelize at the local Postgres instance (`127.0.0.1`), so the full server boots and tables are truncated between suites.
- Running `npm run jest -- --runTestsByPath …` directly **does not** set those overrides; Jest inherits whatever lives in `.env.test`, so `DB_HOST` resolves to the Docker hostname `db`. On a bare Mac that host does not exist, and you will see `SequelizeHostNotFoundError: getaddrinfo ENOTFOUND db`.
- If you need to scope Jest without the watcher, either (a) piggyback on the existing script (`npm run test:dev -- --runTestsByPath __tests__/auth.test.ts`) or (b) export the overrides manually before calling Jest (`DB_HOST=127.0.0.1 REDIS_REQUIRED=false NODE_ENV=test npm run jest -- --runTestsByPath __tests__/auth.test.ts`).
- Keep this distinction in mind while debugging new feature slices; the plan assumes integration suites run with the same environment wiring as `test:dev`, otherwise failures can be misleading (e.g., auth tests “failing” because the host name cannot be resolved).
