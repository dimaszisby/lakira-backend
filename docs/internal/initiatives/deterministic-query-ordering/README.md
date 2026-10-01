# Deterministic query ordering

**Status:** Complete. Merged in #125 (`2fd4e29`). D-01 and
D-02 promoted to [ADR-0052](../../../explanation/decisions/adr-0052-ordered-queries-are-total.md).
**Slug:** `deterministic-query-ordering` · **Branch:** `fix/deterministic-query-ordering`

Standard kit. Started from a one-off CI failure on PR #124 (Fork Smoke run `36695083548`): the
metric-detail logs query ordered by `createdAt` with a `LIMIT` and returned tied rows in either
order. A sweep found the same class of defect in five more queries.

- [Plan](deterministic-query-ordering-plan.md) — goals, acceptance criteria, phases
- [Checklist](deterministic-query-ordering-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
- Related: [`2026-09-25-todo-integration-parse-error-flake.md`](../../todos/2026-09-25-todo-integration-parse-error-flake.md) — the earlier fixture fix for the same test
