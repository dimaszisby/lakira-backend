# Feature boundaries — Decisions Log

`D-NN` entries scoped to this kit. Promoted entries collapse to a pointer at the ADR registry.

---

## D-01 — Enforce with ESLint, not only the architecture test

- **Status:** Accepted
- **Date:** 2026-09-22

**Context.** C4 is a complaint about `__tests__/unit/architecture.test.ts` being too weak. The
obvious response is to add checks to that test. But a Jest test only runs when the suite runs, and
an import violation is cheapest to catch at the moment it is typed.

**Decision.** Put the import boundary in ESLint `no-restricted-imports`, and keep the architecture
test for structural checks (required directories, DI shape) and for the frozen count.

**Options considered.**

- _Add the boundary checks to the Jest test only._ Rejected: no editor feedback, and violations
  surface minutes later in a full suite run rather than immediately.
- _Add `eslint-plugin-boundaries` or `dependency-cruiser`._ Rejected: both are purpose-built and
  better than hand-rolled patterns, but each is a new production-adjacent dependency that trips
  `security:delta:gate`, and `no-restricted-imports` is already used in this repo for exactly this
  job — `eslint.config.mjs:67-95` bans the legacy `src/services/**` paths the same way.

**Consequences.** The rule is expressed as flat-config `files:` blocks, one per feature, so a
feature may still import itself while being blocked from reaching into siblings. That is more
verbose than a plugin would be — roughly six blocks — but it is explicit and reviewable, and it
adds nothing to `package.json`.

---

## D-02 — The 11 model associations are frozen at an exact count, not allowlisted

Promoted to the architecture decision registry as
**[ADR-0044](../../../explanation/decisions/adr-0044-feature-boundaries-and-their-frozen-exceptions.md)**.
That file is authoritative; this entry is a pointer.

---

## D-03 — Cross-module foreign keys are the real violation; ID-only references are the destination

Promoted to the architecture decision registry as
**[ADR-0044](../../../explanation/decisions/adr-0044-feature-boundaries-and-their-frozen-exceptions.md)**.
That file is authoritative; this entry is a pointer.

---

## D-04 — Dummy generators take the repository port rather than being relocated

- **Status:** Accepted
- **Date:** 2026-09-22

**Context.** Three `GenerateDummy*` use cases in `application/` import `models` directly from
`@/infrastructure/db/models.js`, violating the layering rule. They are dev-only, gated behind
`ENABLE_DUMMY_ENDPOINTS`.

**Decision.** Inject the existing `MetricRepository` and `TransactionPort` and drop the `models`
import.

**Options considered.**

- _Move them to `infrastructure/`._ Rejected, though defensible: a test-data seeder arguably **is**
  infrastructure. But they are invoked over HTTP like any other use case, and moving them would put
  a route handler's collaborator in a layer the router does not otherwise reach into.
- _Leave them and exempt dev-only code from the rule._ Rejected: an exemption keyed on "this is only
  for development" is one nobody can enforce, and the ports already exist.

**Consequences.** A one-line DI change — `feature.ts:34` already has `repo` and `tx` in scope for
`CreateMetric`. `MetricRepository.create(data, tx)` takes a **required** transaction, so the
generators wrap their loop in `runInTransaction`, which also makes bulk dummy generation atomic
rather than partially-applied on failure.

---

## D-05 — A narrow `public.ts` per feature, separate from `index.ts`

- **Status:** Accepted
- **Date:** 2026-09-22

**Context.** Taken mid-implementation, not during planning. Routing the 14 cross-feature imports
through each feature's `index.ts` — which the plan assumed was simply what
`architecture.md` § Export Convention asked for — broke nine unit tests with
`Route.post() requires a callback function but got [object Undefined]`.

The cause is a circular import that the barrel creates:

```
metric/router.ts → metric/controller.ts → metric/dto.ts
  → metric-log/index.ts → metric-log/router.ts → metric-log/controller.ts
  → metric-log/feature.ts → metric/index.ts → metric/router.ts  (already evaluating)
```

Every `index.ts` eagerly constructs its routers at module scope
(`const metricRouter = createMetricRouter()`), so importing a barrel pulls that feature's
composition root and, transitively, its siblings. A sibling reading from a barrel that is
mid-evaluation gets `undefined`.

This is the same hazard cited in [D-02](#) as the reason model associations cannot route through
`index.ts`. It turns out not to be specific to models — it applies to **any** cross-feature import
through a router-constructing barrel.

**Decision.** Give each feature a `public.ts` holding its cross-feature surface, importing no
routers and no `feature.ts`. `index.ts` re-exports it, so the composition root
(`server.ts`) is unaffected. Siblings import `@/features/<name>/public.js`.

**Options considered.**

- _Stop constructing routers at module scope in `index.ts`._ Rejected for this PR, and it is the
  better fix. Exporting only `createXRouter` and letting `server.ts` call it removes the cycle at its
  source rather than routing around it. But it changes runtime wiring for every feature and
  `server.ts` with it — a larger, riskier diff than a caveat about a weak test warrants. Worth its
  own ticket.
- _Keep the deep imports and exempt middleware/providers from the rule._ Rejected: that is the
  violation the kit exists to remove, and each exemption is a place future violations hide.
- _Lazy getters on the barrel._ Rejected: it hides an initialisation-order problem behind
  indirection, and the failure mode when it breaks is worse than an import error.

**Consequences.** Five new files, each a handful of re-exports. The boundary is now expressed as two
entrypoints per feature with different audiences — `public.ts` for siblings, `index.ts` for the
composition root — which is a clearer statement of intent than one barrel serving both. The ESLint
rule needed no change: it bans `domain/`, `application/` and `infrastructure/` paths, and `public.ts`
is none of those.

**This is the second time a barrel cycle has shaped this kit.** D-02 froze the model associations
partly on the same reasoning. If the router-construction fix above is ever done, both decisions
should be revisited — the freeze may no longer be necessary.

---

## D-06 — Domain errors carry a semantic `kind`; the HTTP adapter owns the status

Promoted to the architecture decision registry as
**[ADR-0044](../../../explanation/decisions/adr-0044-feature-boundaries-and-their-frozen-exceptions.md)**.
That file is authoritative; this entry is a pointer.

---
