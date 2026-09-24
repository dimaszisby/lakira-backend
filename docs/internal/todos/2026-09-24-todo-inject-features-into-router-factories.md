# Todo — inject built features into router factories

- **Status:** Open — a follow-up, not a defect
- **Created:** 2026-09-24
- **Owner:** unassigned
- **Origin:** the option deferred in
  [ADR-0045](../../explanation/decisions/adr-0045-feature-modules-construct-nothing-on-import.md)

---

## What

Controllers hold their feature in a module-level slot filled on first use
(`feature ??= buildXFeature()`), and tests replace it through `overrideXFeatureForTest`. It works,
and imports now construct nothing, but dependencies still flow through module state.

`src/server.ts` also calls `overrideMetricLogFeatureForTest(buildMetricLogFeature({ … }))` to install
the real metric-log feature (the visualization invalidator and the RabbitMQ publisher). That is a
**test** hook doing production wiring.

## The cleaner shape

`server.ts` builds each feature and passes it in: `createMetricLogRouter(buildMetricLogFeature({…}))`.
Controllers become closures over the feature they are given. The override hooks and the
module-level slots go away, and tests pass a stubbed feature straight to the factory.

## Why it was deferred

It rewrites every controller and roughly 40 test call sites of the override hooks. ADR-0045 needed
only the lazy getter to remove the import-time hazard, so the larger diff was kept out of that PR.
