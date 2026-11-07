# Feature boundary audience paths — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Checked against `origin/dev` at
`39c1e09` (#122).

## Phase 0 — kit, branch, loose ends

- [x] `fix/feature-boundary-audience-paths` cut with `--no-track` from `dev` at `39c1e09`
- [x] This kit: README, checklist, `decisions.md` with D-01..D-04
- [x] `fork-test-credentials` kit: AC-5 ticked with runs `36592001328` and `36592011288`; README
      status set to merged in #122
- [x] `FINAL-AUDIT-SUMMARY.md` § 8 item 7 corrected: C3 and C4 must close before a dated run can
      restate GOLD (ADR-008); the earlier "ride along as caveats" wording is noted as corrected

## Phase 1 — tests first

- [x] `__tests__/unit/feature-boundaries.lint.test.ts` (D-03). On the old config it failed 3 of 4:
      every full-spelling deep import and composition-root import was allowed, and a model file
      could import auth's flat repository and another feature's `domain/`. The short spelling was
      rejected, as the audit found
- [x] `architecture.test.ts` (D-04): the model freeze regex matches both spellings (the old one
      matched 1 of 2 samples, the new one 2 of 2); a relative-import check with its own failing
      case; zero relative cross-feature imports in `src/features/`; the freeze holds at 11

## Phase 2 — config and code

- [x] `eslint.config.mjs`: one `FEATURE` prefix with an optional `(public|shared)/` segment, used
      by all three patterns; the model exception is a lookahead (D-01)
- [x] Before the port moved, `npx eslint .` reported exactly the 9 known imports and nothing else
- [x] `MetricAccessPort` in metric-log, metric-settings and analytics `application/ports/`; their
      6 source files, 3 `feature.ts` files and 4 unit tests point at their own copy (D-02)
- [x] `npm run lint` clean

## Phase 3 — docs

- [x] `.claude/rules/architecture.md` § Export Convention: both spellings, the tests, and ports
      owned by their consumer
- [x] `docs/explanation/architecture/feature-slice-ddd.md` § Cross-feature imports: the same
- [x] ADR-0044: a dated note on decision 1's one-spelling gap and its closure; links gain the lint test
- [x] ADR-0023: Accepted, with an implementation section; registry row updated
- [x] Todo `2026-09-22-todo-feature-boundary-rule-scope.md`: audience section marked done; status
      now says only scope-widening remains
- [x] `FINAL-AUDIT-SUMMARY.md` § 4: C4 note says the fix landed, pending a dated run (ADR-002)

## Discovered

- [x] Found: `--stdin` linting silently judged the file on disk. With `parserOptions.project`,
      typescript-eslint builds the syntax tree from disk, not stdin, so the first test run reported
      even the short spelling as allowed. Isolated by linting the same text from stdin and from disk
      (0 vs 1 error), then fixed in the test with `--parser-options project:false`; the boundary rule
      needs no type information → in scope, fixed and commented in the test
- [x] Found: widening the rule to `server.ts` and `worker.ts` (deep imports there today) → out of
      scope, the existing scope todo

## Acceptance

- [x] **AC-1** — Deep imports of another feature are rejected in both spellings for `domain/`,
      `application/` and `infrastructure/`, by the real config (lint test, case 1). _Why:_ C4's
      reproduced bypass.
- [x] **AC-2** — `index`, `feature` and bare composition-root imports are rejected in both
      spellings (case 2). _Why:_ the same gap in ADR-0045's rule.
- [x] **AC-3** — `public.js` in either spelling and relative imports within a feature are allowed
      (case 3); a model file may import models and nothing else, auth's flat repositories included
      (case 4). _Why:_ the sanctioned paths and the frozen exception stay open.
- [x] **AC-4** — `npm run lint` is clean with zero cross-feature deep imports; `MetricAccessPort` is
      consumer-owned. _Why:_ the 9 live violations.
- [x] **AC-5** — The lint test failed 3 of 4 on the old config and passes 4 of 4; the relative-import
      check and the two-spelling freeze each have a failing case. _Why:_ ADR-0044 decision 6.
- [x] **AC-6** — Rules file, explanation page, ADR-0044, ADR-0023 and the registry describe what is
      enforced now. _Why:_ docs must not claim more than the rule does.

## Gates

All on Node 24.21.0.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0
- [x] build — exit 0
- [x] tests — unit 641/641 (631 on `dev`); integration 202 passed, 5 skipped
- [ ] OpenAPI — skipped: no route, schema or `src/lib/openapi/**` change
- [ ] security delta — skipped: no dependency change
