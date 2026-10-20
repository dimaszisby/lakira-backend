# Boundary rules everywhere — Plan

- **Status:** In progress
- **Appetite:** 2 days
- **Date:** 2026-10-20

## Context and goals

Register rows B-28 (audit 2026-10-12, W6; and items 2, 3, 5 and 6 of
`2026-10-11-todo-apperror-lint-rule-review-leftovers.md`) and B-29
(`2026-09-22-todo-feature-boundary-rule-scope.md`). Probed on `dev` at `0a86693` by linting piped
text under real paths: the inner layers took `zod`, `winston`, `@/shared/middleware/error.js` and
`@/utils/logger.js`; non-canonical spellings reached another feature unseen; only `*.ts` was
matched; most of `src` outside `src/features` had no feature rule; three exemptions were wider than
their comments; `process.getBuiltinModule` and `Function` loaded code unseen.

When this lands, every file under `src` is checked, the inner layers import from a named list,
each place outside `src/features` enters a feature by one door, and the exemptions name their
files.

## Acceptance criteria

- **AC-1** — Every probed spelling and package is rejected in a domain or application file, with
  the allowed imports still allowed.
  _Why:_ W6; the probe found them passing.
- **AC-2** — A `.js`, `.tsx` and `.mjs` file in a domain folder get the domain rules.
  _Why:_ W6; the blocks matched `*.ts` only.
- **AC-3** — Each door lets its own imports through and refuses a deep one; `server.ts`,
  `worker.ts`, `src/constants` and `src/tests` refuse any feature import.
  _Why:_ B-29.
- **AC-4** — The models exemption covers exactly six files.
  _Why:_ W6; the glob covered eleven model files and any same-named mapper.
- **AC-5** — `process.getBuiltinModule` and the `Function` constructor are rejected under `src`.
  _Why:_ W6 and todo item 5.
- **AC-6** — `npx eslint src` reports nothing, and the suite passes.
  _Why:_ the rules must hold the code as it is.
- **AC-7** — Each new rule is seen to reject a deliberate violation in a real file.
  _Why:_ the B-29 todo's condition for trusting a rule.

## Open questions

None.

## Out of scope

Todo item 3 (the build aliases), filed as B-73; moving the logger behind a port; any change to
what a feature imports beyond `src/app.ts`.

## Decisions expected

Extensions (D-01); allowlists (D-02); canonical paths (D-03); doors (D-04); named exemptions (D-05);
module loaders (D-06); `public.ts` re-exports (D-07).

## Phases

### Phase 0 — kit and branch

### Phase 1 — lint-test cases first

### Phase 2 — the config, and `src/app.ts`

### Phase 3 — `eslint src` clean, the suite, rules seen to reject in real files

### Phase 4 — gates, review, docs

## Risks and trade-offs

An allowlist must be kept: a new inner-layer import fails lint until it is listed with a reason.
That is the intent.

## Rollback

Code: revert the PR. Lint only, apart from where `src/app.ts` imports two middlewares from.

## References

- ADR-0074; ADR-0044; ADR-0058; audit 2026-10-12 § 6 W6
