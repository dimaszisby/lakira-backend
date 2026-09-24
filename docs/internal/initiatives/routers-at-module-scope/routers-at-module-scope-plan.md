# Routers at module scope — Plan

- **Status:** Done
- **Appetite:** 2 days — past that, cut scope rather than extend
- **Date:** 2026-09-24

## Context and goals

Every feature builds its routers when its module is imported (`export const metricRouter =
createMetricRouter()`), so importing a feature barrel for any reason pulls its controller, its
composition root and its siblings. That caused the circular-import failure
(`Route.post() requires a callback function but got [object Undefined]`) behind two workarounds in
the feature-boundaries kit: a `public.ts` per feature (its D-05) and part of the reason for
freezing 11 model associations (its D-02). Source:
[`2026-09-22-todo-routers-constructed-at-module-scope`](../../todos/2026-09-22-todo-routers-constructed-at-module-scope.md).

**The todo's scope is too small.** Routers are not the only things built at import. Every
controller runs `let feature = buildXFeature()` at module scope, and `authMiddleware` is
`createAuthMiddleware()` at module scope. Both sit on the same import path. With only the router
`const`s removed, `metric-log`'s controller would still build its feature while `metric/index` is
half-loaded. So controllers and `authMiddleware` become lazy too.

Goal: importing any feature module constructs nothing. `src/server.ts` is the one place routers
are built. `public.ts` stays as the deliberate narrow sibling surface (user's decision, D-02), now
enforced by lint rather than needed to dodge a cycle.

## Acceptance criteria

- **AC-1** — No module under `src/features/` constructs a router, a feature, or `authMiddleware`
  at import time.
  _Why:_ that construction is the hazard; the todo's router-only scope leaves most of it in place.
- **AC-2** — Each `index.ts` exports only router factories and `buildXFeature`. `server.ts` creates
  every router, and no longer deep-imports analytics.
  _Why:_ one composition root, per the todo.
- **AC-3** — The hazard is gone, not avoided. As a temporary experiment, `metric-log/feature.ts`
  and `metric/.../dto.ts` import from sibling `index.js` instead of `public.js`. The suite fails on
  `dev` and passes after the fix; the experiment is then reverted.
  _Why:_ the todo's own verification step. A passing suite alone proves nothing, since the
  workaround already made it pass.
- **AC-4** — ESLint rejects a sibling import of another feature's `index` (bare alias or
  `/index.js`) or `feature.js`, and still accepts `public.ts` and a feature's own imports.
  _Why:_ with the cycle gone, only a rule keeps siblings on the narrow surface (D-02).
- **AC-5** — Behaviour is unchanged. `npm test` passes, the integration suite passes 5 runs in a
  row, `docs:openapi:check` shows no diff, and `contract:local:gate` passes with 37 of 46
  operations selected at seed 42.
  _Why:_ this changes runtime wiring for every feature.
- **AC-6** — Rules, docs and ADRs describe the new rule: ADR-0045, a status note on ADR-0044, and
  `architecture.md` § Export Convention.
  _Why:_ `architecture.md` still says "features export through `index.ts` only", which
  contradicts ADR-0044 today.

## Open questions

- [x] **Q-1** — Keep or delete `public.ts` once the cycle is gone? Answered by the user: keep, as
      the narrow surface ([D-02](decisions.md)).

## Out of scope

- Moving the trends endpoint (metric → analytics composition root) into analytics.
- Injecting built features into router factories.
- Removing the 11-association freeze.
- Widening the boundary rule beyond `src/features/**` (its own open todo).

## Decisions expected

All four are taken; see [decisions.md](decisions.md):

- D-01 lazy getters vs feature injection
- D-02 `public.ts` kept
- D-03 the association freeze
- D-04 the metric → analytics exemption

## Phases

### Phase 0 — Prove the hazard, write the guard

Run the AC-3 experiment on unmodified code and record the failure. Add the construction-free
architecture test and watch it fail.

### Phase 1 — Make imports construction-free

Routers lose their module-scope instances, and analytics gets a factory. `index.ts` files export
factories. Controllers and `authMiddleware` become lazy. `server.ts` builds and mounts the routers.
Update the analytics router test.

### Phase 2 — Enforce the surface

Add the ESLint sibling composition-root ban and the D-04 exemption, proven against a deliberate
violation.

### Phase 3 — Verify, then document

Gates, the AC-3 experiment on the fixed code, and the contract gate. Then the rules, docs, ADR-0045
and the ADR-0044 note.

## Risks and trade-offs

- **Lazy construction moves failure to the first request.** A broken `buildXFeature` now surfaces
  on the first call rather than at boot. The integration suite exercises every router, so it
  still fails in CI.
- **`authMiddleware` must keep its identity.** Router tests assert on the exact function. The lazy
  wrapper is still a single exported function.

## Rollback

Code only; no migrations or data changes. Revert-safe: reverting the PR restores the previous
wiring exactly.

## References

- [ADR-0044](../../../explanation/decisions/adr-0044-feature-boundaries-and-their-frozen-exceptions.md)
- [`feature-boundaries` decisions](../feature-boundaries/decisions.md), D-02 and D-05
