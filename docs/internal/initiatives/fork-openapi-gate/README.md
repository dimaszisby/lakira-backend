# Fork OpenAPI gate and bootstrap ordering

**Status:** Complete on `fix/fork-openapi-gate`; gates green on Node 24.21.0. One item is open until
the branch is pushed: the `Fork Smoke` workflow change is applied by the repository owner, and its
first run is the proof of AC-5.
**Slug:** `fork-openapi-gate` · **Branch:** `fix/fork-openapi-gate`

Lean kit — no plan; acceptance criteria live in the checklist. Fixes audit findings S2 (P1), S3 and
S4 (P2) of `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 6, all in
`scripts/bootstrap-fork.sh`. They stay open in the audit until a dated run confirms them (ADR-002).

- [Checklist](fork-openapi-gate-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries
- Origin: [`2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md`](../../todos/2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md)
