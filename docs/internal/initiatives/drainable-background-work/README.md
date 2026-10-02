# Drainable background work

**Status:** Merged in #128 (`6fc3c00`). D-01 to D-05 promoted to
[ADR-0054](../../../explanation/decisions/adr-0054-post-response-work-is-tracked-and-drained.md).
**Slug:** `drainable-background-work` · **Branch:** `fix/drainable-background-work`

Standard kit. Fixes audit finding R3 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6,
P2): the verification email in register and resend was started without being tracked, so it raced
the next test's `TRUNCATE`, outlived `sequelize.close()`, and was not waited for on SIGTERM. R3
stays open in the audit until a dated run confirms it (ADR-002).

- [Plan](drainable-background-work-plan.md) — goals, acceptance criteria, phases
- [Checklist](drainable-background-work-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
- Origin: [`2026-09-25-todo-integration-parse-error-flake.md`](../../todos/2026-09-25-todo-integration-parse-error-flake.md)
  § The `TRUNCATE` failure, explained
