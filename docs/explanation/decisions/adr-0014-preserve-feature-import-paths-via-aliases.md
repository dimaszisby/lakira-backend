# ADR-0014 — Preserve `@/features/<feature>/*` import paths via tsconfig aliases

- **Status:** Accepted
- **Date:** 2026-05-01
- **Origin:** `ADR-002` in the Feature audience restructure kit — [`feature-audience-restructure`](../../internal/initiatives/feature-audience-restructure/decisions.md)
- **Note:** originally logged as _Proposed_.
- **Note:** date backfilled from git history; the kit left it as `YYYY-MM-DD`.

---

## Context

Many constraint-locked dirs (`src/utils`, `src/types`, `src/infrastructure`, `src/lib`, `src/worker.ts`) import features by alias today. The task constraint forbids touching those files. A naive directory move would break every one of those imports.

## Decision

Add per-feature TypeScript path aliases that map each `@/features/<feature>/*` to its new audience-scoped location. Apply to **both** `tsconfig.json` and `tsconfig.build.json`. The runtime build resolver (`scripts/resolve-build-aliases.mjs`) honors them.

## Options considered

1. **Update locked files** — violates the user's constraint.
2. **Re-export shim files at old paths** — only works for `index.ts`; deep imports like `@/features/auth/infrastructure/persistence/models/user.sequelize.js` require keeping the entire old tree as shims, doubling files. Rejected.
3. **TS path aliases (chosen)** — zero code edits to locked dirs, minimal surface area, idiomatic.

## Consequences

- Aliases must be added in both tsconfig files; a forgotten entry surfaces as a runtime "Cannot find module" only at `npm run build` time. Phase 0 alias-probe smoke catches this early.
- Internal feature imports inside the moved tree should prefer relative paths to keep slices self-contained, but cross-feature imports keep using the alias — that's why the aliases exist.
- The aliases are technically a transitional shim. Removing them later requires rewriting cross-feature imports to use audience-prefixed paths — see ADR-003.

## Links

[Plan §Strategy / Path-Alias Preservation](../../internal/initiatives/feature-audience-restructure/feature-audience-restructure-plan.md#path-alias-preservation-the-linchpin)

---
