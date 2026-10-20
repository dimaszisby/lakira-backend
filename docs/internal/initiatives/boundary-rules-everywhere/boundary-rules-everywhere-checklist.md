# Boundary rules everywhere — Checklist

## Phase 0 — kit and branch

- [x] `fix/boundary-rules-everywhere` cut with `--no-track` from `origin/dev` at `0a86693`; HEAD
      and upstream verified
- [x] `README.md`, the plan, this file, `decisions.md`

## Phase 1 — lint-test cases first

- [x] `__tests__/unit/feature-boundaries.lint.test.ts` — "the rules cover all of src, by allowlist
      where a layer is inner", and the ORM-registry and OpenAPI case as two doors. On the config
      before the change, 19 of 62 failed

## Phase 2 — the config, and `src/app.ts`

- [x] `eslint.config.mjs`:
  - `EXT` on every boundary glob
  - `DOMAIN_IMPORTS`, `APPLICATION_IMPORTS`, `onlyFrom`, in place of the driver-package denylist
  - `CANONICAL_PATH`; `FEATURE` reads any name
  - `featureDoor` and the four doors; `NO_FEATURE_IMPORT` for every other file, in a catch-all
    block first
  - `MODEL_ASSOCIATION_FILES`, the six files
  - `process.getBuiltinModule` and the `Function` constructor
- [x] `src/app.ts` — `authMiddleware` and `requireOrgRole` from auth's `index.ts`

## Phase 3 — the rules hold

- [x] `npx eslint src` — clean after the `src/app.ts` change; the two deep imports were its only
      findings
- [x] Seen to reject in real files (written, linted, deleted): `zod` in a `.js` domain file, the
      error middleware in an application file, a feature's `public.ts` from `src/constants`, a
      domain entity from `src/composition`, a non-canonical path, `process.getBuiltinModule` and
      `new Function` in `src/utils` — 7 of 7 refused

## Phase 4 — docs and records

- [x] ADR-0074 (Proposed), its registry row; dated notes on ADR-0044 and ADR-0058; `CLAUDE.md`
      counts 74
- [x] `.claude/rules/architecture.md` § Dependency Rules and § Export Convention
- [x] both todos updated; item 3 filed as `2026-10-20-todo-alias-paths-survive-the-build.md`, B-73
- [x] Register: B-28 and B-29 to Closed; B-73 added; #193's loose ends

## Discovered

- [x] Found: `src/app.ts` deep-imported auth's two middlewares, moved there from `server.ts` by
      #192 → in scope, they come from auth's `index.ts`
- [x] Found: the existing lint test allowed `@/types/request.context.js` in the shared kernel's
      domain and application files; the allowlist refuses that HTTP type there → in scope, the
      expectation follows the rule
- [x] Found: a relative path from a feature into `src/shared/middleware` is still read by no
      rule → recorded in ADR-0074 § Consequences; no file does it

## Acceptance

- [x] AC-1 — "lets a domain file import only from the domain's list", "… an application file …",
      "holds … to the inner layers' list" (three files)
- [x] AC-2 — "holds … to the domain's rules", `.js`, `.tsx`, `.mjs`
- [x] AC-3 — the `app.ts`, composition, ORM-registry and OpenAPI doors; "keeps … out of every
      feature" for four files
- [x] AC-4 — "lets only the six files that need it import another feature's models";
      `architecture.test.ts` still counts 11
- [x] AC-5 — "rejects process.getBuiltinModule and the Function constructor under src"
- [x] AC-6 — `npx eslint src` clean; the suite passes
- [x] AC-7 — Phase 3, 7 of 7

## Gates

- [x] typecheck
- [x] lint
- [x] format — named files only
- [x] tests — `test:coverage`: unit 1396 passed; integration 278 passed, 5 skipped; thresholds met
- [x] build
- [x] OpenAPI — no drift; contract quick profile 36 passed, 6 skipped, the same two warnings
- [ ] image smoke — skipped: no Docker or dependency changes
- [ ] security delta — skipped: no dependency changes
