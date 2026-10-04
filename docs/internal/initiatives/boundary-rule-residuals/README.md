# Boundary rule residuals

**Status:** Complete on `fix/boundary-rule-residuals`; gates green on Node 24.21.0. D-02 and D-03
promoted to
[ADR-0058](../../../explanation/decisions/adr-0058-inner-layers-and-shared-code-import-rules.md).
**Slug:** `boundary-rule-residuals` · **Branch:** `fix/boundary-rule-residuals`

Standard kit. Closes the two routes around the feature-boundary rule that keep SaaS-readiness caveat
C4 open (`docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 4.1; findings S5 and S6). C4
stays open in the audit until a dated run confirms the fix (ADR-002).

- [Plan](boundary-rule-residuals-plan.md) — goals, acceptance criteria, phases
- [Checklist](boundary-rule-residuals-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
- Origin: [`2026-10-03-todo-boundary-rule-types-and-application-infra.md`](../../todos/2026-10-03-todo-boundary-rule-types-and-application-infra.md)
