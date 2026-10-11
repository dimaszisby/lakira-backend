# Todo — what the review of the `AppError` lint rule left open

- **Status:** Open (one P2, three P3)
- **Created:** 2026-10-11
- **Owner:** unassigned
- **Origin:** the code review of `fix/c4-apperror-lint-rule`
  ([`boundary-rule-residuals` D-07](../initiatives/boundary-rule-residuals/decisions.md)). The
  reviewer graded V4 closed. None of these is the route caveat C4 closes on (ADR-012 of the audit
  folder), so each is a finding in its own right

## Items

1. **P2 — a dynamic `import()` gets past every boundary rule.** `no-restricted-imports` reads
   static `import` and `export … from` only. `export const x = () => import("@/utils/AppError.js")`
   linted under `src/shared/domain/errors/DomainError.ts` reports nothing (reproduced 2026-10-11).
   The build rewrites the `@/` alias inside `import()` too, so it would run. This is not specific
   to the `AppError` rule: the feature-boundary, inner-layer and shared-code rules have the same
   gap. No file in `src/features` or `src/shared` uses a dynamic import to cross a boundary today
   (not swept; check before closing). A fix is one `no-restricted-syntax` selector on
   `ImportExpression` per block, or a case in `__tests__/unit/architecture.test.ts`, which reads
   source text.
2. **P3 — `src/types/domain` is not a domain layer to the linter.** It holds three type-only files
   and gets the generic `src/types/**` block, so `@utils/AppError.js` is allowed there. Nothing in
   it imports `AppError`. Decide whether the directory is a domain layer; if so, add it to the
   domain blocks.
3. **P3 — the `@utils/*` and `@config/*` aliases do not survive the build.** Read by the reviewer
   in `scripts/resolve-build-aliases.mjs`, not reproduced: the script rewrites `@/` only, so an
   import through `@utils/` typechecks, passes Jest and would not resolve in `dist/`. No file in
   `src/` uses either alias. `.claude/rules/code-style.md` tells authors to use them. Either teach
   the script the two aliases or drop them from `tsconfig.json`, Jest and the rule.
4. **P3 — the lint message cites a section that does not name the rule.** The message ends "See
   .claude/rules/architecture.md § Dependency Rules", and that file never mentions `AppError`.
