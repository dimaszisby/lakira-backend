# Fuzz the organization routes

**Status:** Complete — gate at 42/47 selected, passing; awaiting PR.
**Slug:** `fuzz-organization-routes` · **Branch:** `test/fuzz-organization-routes`

Lean kit — no plan; acceptance criteria live in the checklist.

The contract gate fuzzes only the tags in `DEFAULT_TAGS`, and `Organizations` was never one of
them, so none of its 6 operations was ever fuzzed. This kit brings them in, and excludes by name
any that cannot be fuzzed meaningfully, with the reason recorded. Origin:
[`2026-09-25-todo-fuzz-organization-routes.md`](../../todos/2026-09-25-todo-fuzz-organization-routes.md).

- [Checklist](fuzz-organization-routes-checklist.md) — acceptance criteria, work items, gates
- [Decisions](decisions.md) — `D-NN` entries
