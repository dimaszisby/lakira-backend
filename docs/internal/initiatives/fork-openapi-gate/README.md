# Fork OpenAPI gate and bootstrap ordering

**Status:** Complete. Merged in #134 (`0ce4511`). `Fork Smoke` passed with the new lint, typecheck and
OpenAPI steps on that PR, on both the push and the pull-request run, which proves AC-5.
**Slug:** `fork-openapi-gate` · **Branch:** `fix/fork-openapi-gate`

Lean kit — no plan; acceptance criteria live in the checklist. Fixes audit findings S2 (P1), S3 and
S4 (P2) of `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 6, all in
`scripts/bootstrap-fork.sh`. They stay open in the audit until a dated run confirms them (ADR-002).

- [Checklist](fork-openapi-gate-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries
- Origin: [`2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md`](../../todos/2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md)
