# ADR-0001 — Align TS Path Aliases to Repo Root

- **Status:** Accepted
- **Date:** 2025-02-14
- **Origin:** `ADR-002` in the Static checks kit — [`tests-1-static-checks`](../../internal/initiatives/tests-1-static-checks/decisions.md)

---

## Context

`npm run typecheck` could not resolve any `@/` imports because `tsconfig.json` used `baseUrl: "src"` with `paths` redirecting to `./*`. Under NodeNext this translated to candidate paths like `src/config/envManager` that lack `.js` extensions and therefore failed resolution.

## Decision

Move `baseUrl` to the repository root and expand `paths` mappings to `@/* -> src/*`, `@utils/* -> src/utils/*`, and `@config/* -> src/config/*`. This keeps alias resolution consistent for files inside `src` and external suites once we tackle the NodeNext extension requirement.

## Consequences

TypeScript lookups now originate from repo root, matching Jest + bundler behavior. Follow-up work must still address NodeNext’s insistence on `.js` specifiers, but path aliases are no longer blocked by the previous relative mapping.

## Links

`tsconfig.json` (2025-02-14 change), checklist Phase 0 notes.
