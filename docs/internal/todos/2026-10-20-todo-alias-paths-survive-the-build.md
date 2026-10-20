# Todo — the `@utils/*` and `@config/*` aliases do not survive the build

- **Status:** Open. Register row B-73
- **Created:** 2026-10-20
- **Owner:** unassigned
- **Origin:** item 3 of `2026-10-11-todo-apperror-lint-rule-review-leftovers.md`, left out of the
  `boundary-rules-everywhere` kit because it is a build change, not a lint rule

## What

`tsconfig.json` and Jest map `@utils/*` and `@config/*`, but `scripts/resolve-build-aliases.mjs`
rewrites `@/` only. An import through either alias typechecks and passes Jest, and would not
resolve in `dist/`. Read by the original reviewer, not reproduced.

No file in `src/` uses either alias today. `.claude/rules/code-style.md` still tells authors to.

## Options

1. Teach `resolve-build-aliases.mjs` the two aliases.
2. Drop them from `tsconfig.json`, Jest's `moduleNameMapper`, the code-style rule and the lint
   patterns, leaving `@/` as the one alias.

## Verify

A built file that imports through the alias kept runs from `dist/`; or, for option 2, the dropped
alias fails typecheck.
