# ADR-0002 — NodeNext Specifier Strategy

- **Status:** Accepted
- **Date:** 2025-02-14
- **Origin:** `ADR-003` in the Static checks kit — [`tests-1-static-checks`](../../internal/initiatives/tests-1-static-checks/decisions.md)

---

## Context

Even after fixing path aliases, `tsc --noEmit` continued to fail with TS2835 because the codebase imports relatives/aliases without `.js` extensions while `module`/`moduleResolution` remain `NodeNext`. This also implies the emitted `dist/**` modules will break on vanilla Node without the `--es-module-specifier-resolution=node` flag.

## Decision

Adopt option 1—update all source imports (relative and aliased) to include `.js` suffixes so TypeScript type-checking matches the emitted ESM output. Jest’s `moduleNameMapper` and ts-jest config will be updated to strip `.js` during tests where needed.

## Consequences

Once `.js` suffixes are applied across `src/**`, we won’t need post-build rewrites or nonstandard runtime flags. The change may touch many files, so it should happen in a dedicated PR with lint + typecheck + runtime verification.

## Links

Typecheck logs (2025-02-14), `docs/internal/initiatives/tests-1-static-checks/static-checks-plan.md`.
