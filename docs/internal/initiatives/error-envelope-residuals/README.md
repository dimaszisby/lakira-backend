# Error envelope residuals

**Status:** Phase 1 merged in #124 (`7ea5ec6`). Phase 2 (429 envelope) merged in #131
(`582c1b5`). C3 was confirmed closed by the dated run of 2026-10-03. Plan Q-1 was answered on
2026-10-03. D-03, D-05 and D-07 promoted to
[ADR-0057](../../../explanation/decisions/adr-0057-rate-limiters-answer-through-the-error-envelope.md).
The frontend handoff is the Notion record "Rate-limit (429) body moves into the error envelope"
(D-06).
**Slug:** `error-envelope-residuals` · **Branch:** `fix/error-envelope-residuals` (Phase 1),
`fix/error-envelope-residuals-429` (Phase 2)

Standard kit. Addresses the C3 residuals reopened by
`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 4.1 (`saas-gold-reaudit` D-05). C3
stays "Reopened" until a new dated audit run confirms the fix (ADR-002).

- [Plan](error-envelope-residuals-plan.md) — goals, acceptance criteria, phases
- [Checklist](error-envelope-residuals-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
- Origin: [`2026-09-29-todo-error-envelope-residuals.md`](../../todos/2026-09-29-todo-error-envelope-residuals.md)
