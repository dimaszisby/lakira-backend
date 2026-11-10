# ADR-0092 — One import alias, `@/`

- **Status:** Accepted
- **Date:** 2026-11-10
- **Related:** issue #259 (register row B-73; audit of 2026-10-20 § 6, X45); narrows
  [ADR-0001](./adr-0001-align-ts-path-aliases-to-repo-root.md), which set the aliases; makes
  [ADR-0078](./adr-0078-relative-paths-and-contracts-in-the-inner-layers.md)'s widening of the
  canonical-path rule to `@utils/` and `@config/` moot; [ADR-0074](./adr-0074-boundary-rules-cover-all-of-src.md),
  one spelling per module
- **Origin:** issue #259, planned and approved on 2026-11-10

---

## Context

`tsconfig.json` and Jest mapped three aliases: `@/*`, `@utils/*` and `@config/*` (ADR-0001). The
build, `scripts/resolve-build-aliases.mjs`, rewrote only `@/`. So an import through either of the
other two typechecked and passed every test, and failed when the built app ran from `dist/`. No
file used them, yet `code-style.md`, `CLAUDE.md`, `CONTRIBUTING.md` and two skills told authors to,
and the lint rules had been widened to hold them to one spelling (ADR-0078, X45).

## Decision

- **`@/` is the only alias.** `@utils/*` and `@config/*` are removed from `tsconfig.json`, Jest's
  `moduleNameMapper` and `jsconfig.json`. `@/utils/...` and `@/config/...` reach the same files.
- **Lint refuses both** anywhere under `src/`, naming the replacement, so the reason is given where
  typecheck would only say the module cannot be found.
- `__tests__/unit/feature-boundaries.lint.test.ts` checks that lint rejects every spelling of
  either alias, and that neither config maps them again.

## Options considered

- **Teach the build both aliases:** a second and third spelling of every module to rewrite and to
  police, for no file that uses them.

## Consequences

- An import through `@utils/` or `@config/` fails typecheck (TS2307) and lint, as it always failed
  in `dist/`.
- The documents that recommended them now name `@/` alone.
