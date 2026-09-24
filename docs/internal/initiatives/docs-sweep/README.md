# Docs sweep

**Status:** In progress — plan approved 2026-09-24.
**Slug:** `docs-sweep` · **Branch:** `docs/docs-sweep`

Lean kit — no plan; acceptance criteria live in the checklist.

Fixes stale facts across the docs, the `.claude/` rules, and the agents and skills, then removes
emoji markers from existing docs. The stale facts were found by three read-only sweeps that
checked every claim against the code, `package.json`, the CI workflows and git history. Stale docs
here are not cosmetic: AI sessions read them as instructions, and two handoffs in a row carried a
false premise taken from one.

It lands as one PR with two commits. The first fixes content. The second is the mechanical emoji
pass, so it can be reviewed, and if necessary reverted, on its own.

- [Checklist](docs-sweep-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries
