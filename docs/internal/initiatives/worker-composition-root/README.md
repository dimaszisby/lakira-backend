# Worker composition root

**Status:** Complete. Merged in #130 (`b1398cc`); gates green on Node 24.21.0. D-01, D-02, D-05
and D-06 promoted to
[ADR-0056](../../../explanation/decisions/adr-0056-one-wiring-per-feature-for-every-entry-point.md).
**Slug:** `worker-composition-root` · **Branch:** `fix/worker-composition-root`

Standard kit. Fixes audit finding R5 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6,
P2): the worker hand-wired the dummy-log handler with a no-op visualization invalidator, so a
queued job left the analytics caches stale until their TTL, while the HTTP path cleared them. R5
stays open in the audit until a dated run confirms it (ADR-002).

- [Plan](worker-composition-root-plan.md) — goals, acceptance criteria, phases
- [Checklist](worker-composition-root-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
- Related: [`2026-09-24-todo-inject-features-into-router-factories.md`](../../todos/2026-09-24-todo-inject-features-into-router-factories.md)
