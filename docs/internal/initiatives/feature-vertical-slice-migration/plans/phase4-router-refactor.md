# Phase 4 – Router Factory Refactor Plan

- Timestamp: 2025-12-03T19:30:00Z

## Problem Statement

- `src/routes/*.routes.ts` still expose Express routers as legacy entrypoints even though the underlying handlers now live inside feature slices.
- `src/server.ts` manually imports each legacy router, coupling the composition root to individual files and preventing feature-level dependency injection/overrides.

## Goals

1. Each feature exports a router factory (e.g., `createMetricRouter(deps)`), defined inside the feature’s infrastructure layer.
2. `src/server.ts` composes routers exclusively via feature entrypoints (e.g., `import { metricRouter } from "@/features/metric"`), eliminating imports from `src/routes`.
3. Legacy `src/routes/*.routes.ts` files are deleted once the new factories are wired.
4. Future features follow the same pattern, enabling per-feature middleware decoration and easier testing.

## Target Architecture

```
src/features/<feature>/
  infrastructure/
    http/
      router.ts        // exports createRouter()
      controller.ts
      validators.ts
  index.ts             // re-exports router + factories for server bootstrap

src/server.ts
  import { authRouter } from "@/features/auth";
  app.use("/api/v1/auth", authRouter);
```

### Dependencies

- Each router factory should accept dependencies (use case factories, middleware) via a simple composition object to aid testing.
- Feature-level entrypoints (`src/features/<feature>/index.ts`) aggregate router exports and any container wiring (e.g., `buildAuthFeature()`).

## Work Breakdown

1. **Auth Router** _(2025-12-03)_
   - Moved `src/features/auth/infrastructure/http/router.ts` contents into `src/features/auth/infrastructure/http/router.ts`.
   - `src/features/auth/index.ts` now re-exports `authRouter`.
   - `src/server.ts` mounts the feature router; legacy route file deleted.
2. **Metric Router** _(2025-12-03)_
   - Legacy router deleted; feature exposes `metricRouter` via `src/features/metric/index.ts`.
   - `src/server.ts` mounts the feature router for `/api/v1/metrics`.
3. **Metric Log Router** _(2025-12-03)_
   - Feature router now owns `/api/v1/metric-logs`; legacy route removed.
4. **Metric Settings Router** _(2025-12-03)_
   - Feature router now handles `/api/v1/metric-settings`; legacy route removed.
5. **Metric Category Router** _(2025-12-04)_
   - Feature router now owns `/api/v1/metric-categories`; legacy `routes.ts` deleted and the slice exports `createMetricCategoryRouter`.
6. **Analytics Router**
   - Already under feature slice; ensure naming/pattern matches the new standard and export via `src/features/analytics/index.ts`.

## Testing Strategy

- Update existing HTTP integration tests to import routers from feature entrypoints when spinning up test apps.
- Run `npm run test:dev` after each migration to ensure no regressions in route wiring.

## Follow-Ups

- Done (2025-12-03) Removed the `@routes/*` alias from `jsconfig.json` and added ESLint guardrails for `src/routes/**`.
- Done (2025-12-03) Documented the router factory pattern in `docs/internal/initiatives/features/README.md`; keep the template updated when new slices are added.
