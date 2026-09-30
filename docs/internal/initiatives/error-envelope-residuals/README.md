# Error envelope residuals

**Status:** Phase 1 (unknown-route 404, framework client errors as 4xx) complete on
`fix/error-envelope-residuals`, gates green on Node 24.21.0. Phase 2 (429 envelope) on hold until
lakira-frontend agrees to the new response shape (plan Q-1).
**Slug:** `error-envelope-residuals` · **Branch:** `fix/error-envelope-residuals` (Phase 1),
`fix/error-envelope-residuals-429` (Phase 2)

Standard kit. Addresses the C3 residuals reopened by
`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 4.1 (`saas-gold-reaudit` D-05). C3
stays "Reopened" until a new dated audit run confirms the fix (ADR-002).

- [Plan](error-envelope-residuals-plan.md) — goals, acceptance criteria, phases
- [Checklist](error-envelope-residuals-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
- Origin: [`2026-09-29-todo-error-envelope-residuals.md`](../../todos/2026-09-29-todo-error-envelope-residuals.md)
