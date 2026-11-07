# ADR-0015 — Defer rewrite of cross-feature imports to audience-prefixed paths

- **Status:** Accepted
- **Date:** 2026-05-01
- **Origin:** `ADR-003` in the Feature audience restructure kit — [`feature-audience-restructure`](../../internal/initiatives/feature-audience-restructure/decisions.md)
- **Note:** originally logged as _Proposed_.
- **Note:** date backfilled from git history; the kit left it as `YYYY-MM-DD`.

---

## Context

After the move, cross-feature imports still use `@/features/<feature>/...` resolved via aliases. The "ideal" target state would have callers use `@/features/public/<feature>/...` so the audience is visible at every import site.

## Decision

Defer the rewrite to a follow-up cleanup PR. This initiative is a structural move; mass-rewriting imports doubles the diff size, increases review risk, and doesn't unlock new capability.

## Options considered

1. **Rewrite in this PR** — large diff, blast radius across every locked-dir consumer. Rejected.
2. **Defer (chosen)** — keeps this PR reviewable; aliases are harmless to leave in place for at least one release cycle.
3. **Codemod-driven rewrite** — possible later; viable if we want to retire aliases without manual edits.

## Consequences

- Aliases remain. They're documented as transitional, not permanent.
- A follow-up PR (tracked in checklist Post-Merge Follow-ups) will remove the aliases and fix locked-dir imports as a focused change.

## Links

[Plan §Open Questions](../../internal/initiatives/feature-audience-restructure/feature-audience-restructure-plan.md#open-questions)

---
