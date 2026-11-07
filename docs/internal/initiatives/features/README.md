# Feature Module Documentation Template

- Last updated: 2025-12-03T20:05:00Z

## Purpose

- Every feature under `src/features/<feature-name>` must describe its scope, layers, and integration contracts.
- This template standardizes documentation so new engineers can onboard quickly and so migrations stay consistent.

## Required Sections (per feature README)

1. **Context**
   - Feature summary and linked tickets/incidents.
   - Business capabilities covered (e.g., create metric, list metrics).
2. **Domain Model**
   - Aggregates/value objects with invariants.
   - Domain events (if any) and repository contracts.
3. **Application Layer**
   - Use cases/handlers (inputs/outputs).
   - Ports (cache, queues, external services).
4. **Infrastructure Layer**
   - Persistence adapters, HTTP controllers, messaging endpoints.
   - External dependencies (datastores, APIs, cache keys).
5. **Testing Strategy**
   - Unit tests per layer, integration tests, smoke/e2e references.
   - How to run them locally (`npm run test <feature>` etc.).
6. **Operational Notes**
   - Observability (metrics/logs), feature flags, rollout plan.
   - Known limitations and TODOs.

## Folder Expectations

```
src/features/<feature>/
  domain/
    entities/
    value-objects/
    services/ (optional)
    repositories/
    events/
    types.ts
  application/
    commands/
    queries/
    use-cases/
    ports/
  infrastructure/
    persistence/
    http/
    cache/
    messaging/
  tests/
    unit/
    integration/
  index.ts
```

- Keep cross-feature dependencies inside `application/ports`.
- Infrastructure adapts external tooling and depends inward only.
- Tests should mirror their target layer (`tests/unit/domain/...` etc.).

## Naming Conventions

- Feature folders use kebab-case (`metric-category`, `metric-log`).
- Files describing actions use verb-first (`CreateMetric.use-case.ts`, `ListMetrics.query.ts`).
- Repository implementations end with technology suffix (`MetricRepoSequelize`).
- HTTP adapters live under `infrastructure/http` and expose express routers or handlers via `index.ts`.

## Router Factory Standard

- Every feature that exposes HTTP endpoints must provide a router factory under `infrastructure/http/router.ts`:

  ```ts
  export const createFooRouter = (deps = defaultDeps) => {
    const router = Router();
    // wire middleware + handlers
    return router;
  };

  export const fooRouter = createFooRouter();
  ```

- Export the factory + prebuilt router from `src/features/<feature>/index.ts`. `src/server.ts` (and tests) import routers exclusively from the feature entrypoint—never from `src/routes`.
- Route-level middleware you reuse across features (auth guards, rate limiters, validation, cache helpers) now lives under `src/shared/middleware/**`; individual features should import from there instead of keeping ad-hoc helpers under `src/shared/middleware`.
- Dummy/test-only endpoints must stay behind environment guards (e.g., `if (env.ENABLE_DUMMY_ENDPOINTS) { ... }`) inside the router factory so production builds never register them unintentionally.

## Feature Composition Roots

- Keep slice composition (`build<Feature>Feature()`) inside `src/features/<feature>/feature.ts`. Controllers/tests can import the builder directly without pulling in router exports, which prevents circular dependencies.
- `src/features/<feature>/index.ts` should remain a thin barrel that re-exports the builder and router so `import "@/features/<feature>"` remains stable for consumers.
- Provide `override<Feature>` helpers in controllers to swap the built feature during tests; reset them in test hooks if the builder is mocked.

## ORM Ownership

- Feature persistence docs must explain how their Sequelize models plug into the shared bootstrap described in `docs/internal/initiatives/orm-bootstrap.md`.
- Keep model definitions under `infrastructure/persistence/models/*.sequelize.ts` and export `register*/associate*` helpers so `src/infrastructure/db/models.ts` can wire them automatically.
- Tests and repositories should import Sequelize models via `@/infrastructure/db/models` whenever they need direct access to the underlying classes.

## Checklist for Maintaining Feature Docs

- [ ] README updated whenever use cases or external contracts change.
- [ ] Link to architecture plan (`docs/internal/initiatives/feature-vertical-slice-migration/plans/feature-vertical-slice-migration-plan.md`).
- [ ] Include timestamps and owner contact.
- [ ] Cross-reference incidents affecting the feature.
