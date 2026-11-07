# Worker Composition Root — Decisions Log

`D-NN` entries scoped to this kit. D-05 and D-06 were taken during review.

---

## D-01 — A feature builds its own queue handlers, and entry points share one wiring

- **Status:** Accepted
- **Date:** 2026-10-03

Promoted to the architecture decision registry as **[ADR-0056](../../../explanation/decisions/adr-0056-one-wiring-per-feature-for-every-entry-point.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — The shared wiring lives in `src/composition/`

- **Status:** Accepted
- **Date:** 2026-10-03

Promoted to the architecture decision registry as **[ADR-0056](../../../explanation/decisions/adr-0056-one-wiring-per-feature-for-every-entry-point.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — The no-op default stays in `buildMetricLogFeature`

- **Status:** Accepted
- **Date:** 2026-10-03

**Context.** The no-op is what the worker picked up. Making the invalidator a required argument
would remove the silent default.
**Decision.** Keep the default; an architecture test forbids `NoopVisualizationInvalidation`
anywhere in `src/` except its own file and the feature factory, and forbids the worker
deep-importing a feature.
**Options considered.** Required argument: rejected, the architecture test requires every factory
to take an optional overrides bag, and every unit test that builds the feature would change.
**Consequences.** The safety is a test, not the type system.

## D-04 — `server.ts` installs the feature through `installMetricLogFeature`

- **Status:** Accepted
- **Date:** 2026-10-03

**Context.** `server.ts` called `overrideMetricLogFeatureForTest` to install the production
feature: a test hook doing production wiring.
**Decision.** The controller exports `installMetricLogFeature`; the test hook delegates to it.
**Options considered.** Pass the built feature into `createMetricLogRouter`: the cleaner shape, and
the subject of `2026-09-24-todo-inject-features-into-router-factories.md`; rejected here, it
rewrites every controller and about 40 test call sites.
**Consequences.** The module-level slot remains until that todo is done.

## D-05 — A duplicate delivery invalidates the caches too

- **Status:** Accepted
- **Date:** 2026-10-03

Promoted to the architecture decision registry as **[ADR-0056](../../../explanation/decisions/adr-0056-one-wiring-per-feature-for-every-entry-point.md)**.
That file is authoritative; this entry is a pointer.

## D-06 — Analytics gets a `public.ts`, and composition imports through `feature.ts` or `public.ts`

- **Status:** Accepted
- **Date:** 2026-10-03

Promoted to the architecture decision registry as **[ADR-0056](../../../explanation/decisions/adr-0056-one-wiring-per-feature-for-every-entry-point.md)**.
That file is authoritative; this entry is a pointer.
