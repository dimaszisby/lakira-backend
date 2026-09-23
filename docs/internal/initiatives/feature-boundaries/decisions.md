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

- **Status:** Accepted
- **Date:** 2026-09-22

**Context.** 11 of the 25 cross-feature imports are Sequelize models importing each other to declare
foreign-key associations. They cannot route through `index.ts` without risking circular imports
between slices, and they cannot simply be deleted — see D-03.

**Decision.** Assert the count is exactly 11. A 12th fails CI; so does removing one without updating
the number.

**Options considered.**

- _A named allowlist of the 11 file→target pairs._ Rejected: more precise and self-documenting, but
  it churns on any file rename, and — more importantly — an allowlist reads as permission. The
  point is to record a debt, not to bless it.
- _A ceiling (`<= 11`)._ Rejected: new violations fail, but a drop from 11 to 4 passes silently and
  the number drifts away from reality until someone looks. A ratchet should resist movement in both
  directions; each one should be a deliberate act.

**Consequences.** Someone adding a legitimate association gets a red build and must edit a number.
That is the intended friction, but it will look like a false positive to whoever meets it first, so
the assertion carries a message explaining what to do and pointing here.

---

## D-03 — Cross-module foreign keys are the real violation; ID-only references are the destination

- **Status:** Accepted
- **Date:** 2026-09-22

**Context.** The question behind C4 was which cross-feature imports count as violations. The 11
model associations look like a necessary exception — Sequelize needs direct model references to
declare a `belongsTo`.

**Decision.** Record that they are **not** an exception but the deepest instance of the problem, and
that the destination is ID-only references across module boundaries. Freeze them now; do not fix
them in this kit.

**Options considered.**

- _Treat model associations as permanently legitimate._ Rejected: it is the industry-standard end
  state for a modular monolith that modules do not share a schema and hold no cross-module FKs —
  references are by ID, and integrity across modules moves to the application layer. Declaring the
  associations fine would write the wrong destination into the rules.
- _Remove the FKs in this kit._ Rejected on size. It means new migrations, rewriting every
  cross-slice eager load, and deciding what replaces the database's integrity guarantees. That is a
  multi-week initiative; C4 is a P1 caveat about a weak test.

**Consequences.** The freeze is a staging post with a documented direction rather than a decision
that 11 violations are acceptable. Promotion candidate for **ADR-0044**, together with D-02 —
"which cross-feature imports are violations" constrains how every future slice is built and would
matter to someone who never saw this kit.

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
