# Phase 4 Plan – Infrastructure Alignment & Legacy Folder Retirement

- Timestamp: 2025-12-03T18:45:00Z

## Scope

- Fold remaining shared infrastructure (ORM definitions, middleware wiring, route registration) into their owning feature slices or neutral adapters.
- Remove the need for `src/services`, `src/controllers`, and `src/routes` folders by ensuring every entrypoint is composed inside a feature.
- Establish lint/CI enforcement so future changes cannot reintroduce legacy-style dependencies.

## Motivation

- Metric, metric-log, metric-settings, auth, and analytics slices are live; the “services” folder is now empty, but the folder still exists and aliases remain.
- Middleware and routing glue still import feature controllers manually; aligning them reduces coupling and simplifies dependency graphs.
- ORM models now live inside each feature, with `src/infrastructure/db/models.ts` acting as a thin bootstrap. Keep the bootstrap lean and ensure future features follow the same pattern.

## Current Landscape

- `src/routes/*.routes.ts` now proxy into feature controllers but still act as shared entrypoints.
- Feature slices export their own Sequelize models; the shared bootstrap simply registers them. Avoid reintroducing shared global models.
- ESLint now blocks imports from `src/services/**`, but `jsconfig.json` still carries aliases referencing the legacy folders.

## Objectives

1. **ORM Ownership**
   - Co-locate Sequelize model definitions (or thin wrappers) inside each feature’s infrastructure layer.
   - Provide a shared `sequelize` bootstrap under `src/infrastructure/db` that exports typed connections without leaking models globally.
2. **Middleware & Routing Alignment**
   - Move any shared middleware that depends on feature logic into the appropriate slice (e.g., auth middleware referencing auth feature ports).
   - Replace `src/routes/*.routes.ts` with per-feature router exports that are composed by `src/server.ts` via feature factories.
3. **Legacy Folder Retirement**
   - Delete empty `src/services` and `src/controllers` directories once imports are gone; remove aliases from `tsconfig.json`/`jsconfig.json`.
   - Update developer docs (feature README template + onboarding) to describe the new composition root.
4. **Tooling Guardrails**
   - Extend ESLint to warn when importing from `src/routes` (once migrated) and add optional codemods to rewrite legacy paths.
   - Update CI docs/test plans explaining how to run slice-specific tests with the new structure.

## Work Breakdown

1. **Inventory & Design (Day 1)**
   - Map every file still under legacy folders (none remain after Phase 4 migrations) to a target slice or shared infra module whenever new legacy pockets appear.
   - Document decisions in this file; flag blockers (e.g., shared middleware needing new ports).
2. **ORM Relocation (Days 2-3)**
   - Begin with low-risk domains (metric settings, analytics) and move their Sequelize models + repo bindings into `infrastructure/persistence`.
   - Ensure migrations continue referencing the centralized Sequelize instance; update feature repositories accordingly.
   - Update tests to import repositories from the feature slice rather than `models`.
3. **Router/Middleware Refactor (Days 3-4)**
   - Introduce feature-level router factories that expose `Express.Router` instances.
   - Update `src/server.ts` to mount routers from each feature entrypoint; remove the old `src/routes/*.routes.ts`.
   - Move auth-specific middleware (e.g., rate limiters, guards) into `src/features/auth/infrastructure/middleware`.
   - Reference `./phase4-router-refactor.md` for router details and `docs/explanation/architecture/shared-middleware.md` for middleware conventions.
4. **Cleanup & Enforcement (Day 5)**
   - Remove `@controllers/*`, `@services/*`, and other legacy aliases from `tsconfig.json` / `jsconfig.json`.
   - Delete empty folders and update documentation/checklists.
   - Run full `npm run test:dev` + `npm run lint` to confirm stability and record outcomes in `../logs/testing/phase4-test-log.md`.
5. **Metric Category Slice Completion**
   - Follow `./metric-category-migration-plan.md` to replace the remaining legacy services/controllers with domain/application/use-case layers.
   - Update HTTP handlers once new use cases are ready, then delete the `legacies/` implementations.

## Dependencies & Risks

- **Database Migrations**: Moving model definitions must not break Sequelize CLI migrations; the new bootstrap (`src/infrastructure/db/models.ts`) keeps compatibility until per-feature registration evolves further.
- **Developer Tooling**: IDE path aliases need updating alongside folder removal; coordinate with frontend if shared types exist.
- **Testing**: Feature-specific integration tests might need new helpers for bootstrapping slice routers; allocate time to adjust `jest.setup.ts`.

## Deliverables

- Updated folder structure with ORM/middleware housed per feature.
- Deleted legacy directories and aliases.
- Documentation updates (feature template, onboarding, checklists) reflecting the final architecture.
- Final Phase 4 test log capturing regression runs after the infrastructure alignment (`../logs/testing/phase4-test-log.md`).

## Tracking & Communication

- Reference this plan from the master checklist (`../checklists/feature-vertical-slice-migration-checklist.md`) under the Phase 4 section.
- Record daily progress summaries in `../tracking/phase4-progress.md` (now created for kickoff tracking).
- Use the incident log if migration steps require downtime or cause test flakiness.
