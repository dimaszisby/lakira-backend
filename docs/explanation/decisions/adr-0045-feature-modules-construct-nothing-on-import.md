# ADR-0045 — Feature modules construct nothing on import; `index.ts` serves the composition root, `public.ts` serves siblings

- **Status:** Accepted
- **Date:** 2026-09-24
- **Related:** Revises the rationale of
  [ADR-0044](./adr-0044-feature-boundaries-and-their-frozen-exceptions.md) decision 2 (the rule
  itself stands).
- **Origin:** `D-01` and `D-02` in the routers-at-module-scope kit —
  [`routers-at-module-scope`](../../internal/initiatives/routers-at-module-scope/decisions.md)

---

## Context

Every feature built things when its module was imported. Routers were
`export const metricRouter = createMetricRouter()`, every controller ran
`let feature = buildXFeature()`, and `authMiddleware` was `createAuthMiddleware()`, all at module
scope. Importing a feature for any reason therefore ran its composition root, which imported its
siblings, which imported it back. A module read while its sibling was still loading got
`undefined`. The observed symptoms were `Route.post() requires a callback function but got [object
Undefined]` and `MetricAccessSequelize is not a constructor`. The second one came from a controller,
not a router, so fixing routers alone would not have been enough.

ADR-0044 decision 2 worked around this with a `public.ts` per feature that imports no routers.

## Decision

1. **Importing a feature module constructs nothing.**
   - Routers are exported as factories only, and `src/server.ts` calls them at mount time.
   - Controllers build their feature on first use: `feature ??= buildXFeature()`. The
     `overrideXFeatureForTest` hooks are unchanged.
   - `authMiddleware` builds its dependencies on its first request, behind the same exported
     function.
   - `__tests__/unit/architecture.test.ts` fails on any module-scope router, feature or middleware
     construction under `src/features/`.
2. **Each feature has two surfaces, and they are separate.**
   - `index.ts` exports the router factories and `buildXFeature`. It is the composition root, for
     `src/server.ts` alone.
   - `public.ts` is the deliberately narrow set other features may import.
   - ESLint rejects a feature importing another feature's `index.ts` (bare alias or `/index.js`) or
     `feature.ts`.

## Options considered

- _Remove only the module-scope router instances._ This was the scope of the original todo.
  Rejected: controllers would still build features while a sibling was half-loaded. Evidence from
  `dev`: pointing two consumers at sibling `index.js` fails 9 tests, and one of the stack traces
  starts at a controller's module-scope `buildMetricLogFeature()`, not at a router.
- _Inject built features into router factories_ (`createXRouter(feature)`, with controllers as
  closures). This is cleaner dependency injection, but it rewrites every controller and roughly 40
  test call sites. Deferred as a follow-up; the lazy getter removes the hazard without that change.
- _Delete `public.ts` and route siblings through `index.ts`,_ now that doing so is safe. Rejected
  by the user: it would expose every feature's composition root (router factories,
  `buildXFeature`) to its siblings, and `public.ts` keeps that surface small on purpose.

## Consequences

- A broken feature composition now fails on its first request rather than at boot. The integration
  suite exercises every router, so CI still catches it.
- `public.ts` keeps its place, but for a different reason: surface narrowness rather than cycle
  avoidance. ADR-0044 carries a status note saying so.
- ADR-0044's freeze of the 11 cross-feature model associations is unaffected. Its standing reason
  is decision 4 (cross-module foreign keys are the real debt), not the cycle.
- One existing crossing is exempted by name: the metric controller builds the analytics feature
  for `GET /metrics/:metricId/trends`. It is tracked as a todo.

## Links

- Kit: [`routers-at-module-scope`](../../internal/initiatives/routers-at-module-scope/README.md)
- Todo that raised it: `docs/internal/todos/2026-09-22-todo-routers-constructed-at-module-scope.md`
- `eslint.config.mjs` (`SIBLING_COMPOSITION_ROOT`), `__tests__/unit/architecture.test.ts`
  ("feature modules construct nothing on import")
