# Decisions — metric-access-wiring

## D-01 — A feature's factory takes another feature's adapter, and `src/composition/` supplies it

- **Status:** Accepted (#214, `d985155`)
- **Date:** 2026-10-23

**Context.** metric's `infrastructure/http/dto.ts` imports metric-log's and metric-settings' response
mappers for the metric detail response, and both features' `feature.ts` import
`MetricAccessSequelize` from metric's `public.ts` as the default for `metricAccess`: each pair
depends both ways (register B-88, frozen by `architecture-boundaries` D-01). analytics' `feature.ts`
imports the same adapter, one way. These three are the only `feature.ts` files that name another
feature. ADR-0056 joins an adapter one feature provides to another in `src/composition/`, and
ADR-0023's Consequences expected the composition root to pass this one through.
**Decision.** Owner's choice, 2026-10-23: all three. `buildMetricLogFeature`,
`buildMetricSettingsFeature` and `buildAnalyticsFeature` take `metricAccess` as a required field,
with no default and no import of metric; their other overrides stay optional.
`src/composition/features.ts` builds one `MetricAccessSequelize` (it holds no state) and hands it
to the three; `buildWiredMetricLogFeature` takes it, or builds one when called without, as the
worker does.
**Options considered.** _Cut the DTO direction:_ metric would copy or relocate two response
shapes the API serves, which then drift. _Only the two pairs:_ analytics would wire differently
from its siblings, and no guard could state the rule.
**Consequences.** metric still reads the two mappers, one way. No feature's composition root names
another feature. A test that builds one of the three factories passes an access adapter.

---

## D-02 — Guards: no pair, and no `feature.ts` naming another feature

- **Status:** Accepted (#214, `d985155`)
- **Date:** 2026-10-23

**Context.** "No two features depend on each other both ways" freezes the two pairs, and nothing
stops a `feature.ts` importing another feature's adapter one way, which is how both pairs began.
**Decision.** `KNOWN_BOTH_WAYS` is empty. A new `architecture.test.ts` case reads every
`feature.ts` under `src/features` with the same import pattern and fails on one that names another
feature.
**Options considered.** _A lint rule:_ `no-restricted-imports` cannot tell a feature's own path
from another's without a rule per feature, and the architecture test already parses these imports.
**Consequences.** An adapter from another feature can only arrive through `src/composition/`.

---

## D-03 — What composition must supply is a parameter of its own, ahead of the overrides

- **Status:** Accepted (#214, `d985155`)
- **Date:** 2026-10-23

**Context.** D-01 first made `metricAccess` a required field of each overrides bag, and
`architecture.test.ts` › "all buildXFeature() accept overrides parameter" failed for the three
factories: it requires every factory's parameter to default to `{}`. That guard answers audit
2026-05-01 finding 10 (some factories took no overrides), so that every feature offers tests the
same optional seams.
**Decision.** The three factories take two parameters: `deps`, which holds what `src/composition/`
must supply (`{ metricAccess }`, typed `MetricLogFeatureDeps` and so on, exported from
`feature.ts`), then `overrides = {}`, optional seams as every other factory has. The guard is
unchanged.
**Options considered.** _A required field in the overrides bag, and a guard relaxed to accept no
default:_ the bag would no longer be optional overrides, and the name would say otherwise. _Keep
`metricAccess` optional and throw when it is missing:_ the compiler would no longer catch a caller
that forgot it.
**Consequences.** A factory's signature separates another feature's adapter from a test seam. A
caller passes `{ metricAccess }` first.
