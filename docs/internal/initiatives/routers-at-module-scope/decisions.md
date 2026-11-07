# Routers at module scope — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Lazy getters, not feature injection into router factories

Promoted to the architecture decision registry as
**[ADR-0045](../../../explanation/decisions/adr-0045-feature-modules-construct-nothing-on-import.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — `public.ts` stays as the sibling surface, now enforced by ESLint

Promoted to the architecture decision registry as
**[ADR-0045](../../../explanation/decisions/adr-0045-feature-modules-construct-nothing-on-import.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — The 11-association freeze stays

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** The freeze (ADR-0044 decision 3) was justified partly by "cannot route through
`index.ts` without risking circular imports".

**Decision.** Keep it. ADR-0044 decision 4 still holds on its own: cross-module foreign keys are the
deepest form of the coupling, and ID-only references are the destination. The freeze records that
debt. Only the cycle half of the rationale is removed from the ESLint comment.

## D-04 — The metric → analytics composition-root import is exempted, not moved

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** The new rule flags one existing import:
`public/metric/infrastructure/http/controller.ts` uses `buildAnalyticsFeature` from
`@/features/analytics/feature.js` to serve `GET /metrics/:metricId/trends`.

**Decision.** Give that one file an explicit, commented exemption, and file a todo.

**Options considered.** _Move the trends endpoint into the analytics router._ Rejected for a
refactor: it changes route ownership and mounting. _Expose a trends use case through analytics'
`public.ts`._ Deferred to the todo, because the right shape (use case or query port) is a design
question of its own.
