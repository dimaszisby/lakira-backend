# Todo — feature barrels construct routers at module scope

- **Status:** Open
- **Created:** 2026-09-22
- **Owner:** unassigned
- **Origin:** diagnosed implementing the `feature-boundaries` kit; see its
  [D-05](../initiatives/feature-boundaries/decisions.md)

---

## What

Every feature's `index.ts` builds its router at module scope:

```ts
import {
  metricRouter,
  createMetricRouter,
} from "./infrastructure/http/router.js";
```

`metricRouter` is a `const` initialised by calling `createMetricRouter()` when the module is first
imported. So importing a feature's barrel for **any** reason pulls that feature's router, its
controller, its `feature.ts` composition root, and transitively its siblings.

That produces real circular imports. Routing cross-feature imports through `index.ts` — what
`.claude/rules/architecture.md` § Export Convention asks for — broke nine unit tests:

```
metric/router.ts → metric/controller.ts → metric/dto.ts
  → metric-log/index.ts → metric-log/router.ts → metric-log/controller.ts
  → metric-log/feature.ts → metric/index.ts → metric/router.ts  (already evaluating)
```

The symptom is `Route.post() requires a callback function but got [object Undefined]` — a barrel
read mid-evaluation returns `undefined`, not an error.

## Why this matters beyond the symptom

Two decisions in the feature-boundaries kit are shaped by this and **would be revisited if it were
fixed**:

- [D-02](../initiatives/feature-boundaries/decisions.md) freezes 11 cross-feature model
  associations partly because they "cannot route through `index.ts` without risking circular
  imports".
- [D-05](../initiatives/feature-boundaries/decisions.md) adds a `public.ts` per feature to route
  around the cycle rather than remove it.

Both are workarounds for this one root cause.

## The fix

Export only `createXRouter` from each feature and let `src/server.ts` call it, so nothing is
constructed by the act of importing. `server.ts` already imports each feature's `index.js`
explicitly (`server.ts:21`), so the call sites are in one place.

**This was deliberately not done in the feature-boundaries PR**: it changes runtime wiring for every
feature plus `server.ts`, which is a larger and riskier diff than a caveat about a weak architecture
test warranted.

## Scope

Six `index.ts` files, six `router.ts` files (drop the module-scope `const`), and `server.ts`.
Afterwards, re-evaluate whether `public.ts` and the D-02 freeze are still needed.

## Verification

`npm test` must pass — the nine failures above are the regression net, since they only appear when
the cycle exists. Then try reverting one `public.ts` consumer to import from `index.js` and confirm
it no longer breaks; that is the proof the cycle is genuinely gone rather than merely avoided.
