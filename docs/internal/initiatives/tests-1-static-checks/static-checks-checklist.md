# Static Checks Checklist

## Phase 0 – Baseline inventory

- [x] Record current `npm run lint` and `npm run typecheck` runtimes; populate `metrics-tracker.md`. (branch: main @6fb4d23 — lint 7.63s, typecheck 7.23s but currently failing with TS2307/TS2835)
- [x] Review `eslint.config.mjs` and `tsconfig.json` for gaps (missing rules, outdated targets) and log findings in `decisions.md` (commit: wip @6fb4d23 — baseUrl realigned to repo root, ADR-002/003 capture NodeNext extension gap).
- [x] Validate local developer workflow (Node/npm versions, required env vars) and document in the README. (commit: wip @6fb4d23 — README now notes Node 18, npm 11, env expectations)

## Phase 1 – Documentation & formatting

- [x] Finalize README/plan/ticket to describe scope, commands, and expectations (commit: wip @6fb4d23 — README commands refreshed, plan notes Phase 1 outcomes).
- [x] Add Prettier scripts (`format:check`, `format:write`) plus documentation for supported file globs (`package.json`, `.prettierignore`, README).
- [x] Decide on formatting ownership (CI vs. pre-commit) and capture ADR entry (ADR-004 — rely on scripts + CI; defer hooks to Phase 2).

## Phase 2 – CI alignment & automation

- [x] Update backend CI workflow to run `lint`, `typecheck`, and `format:check` before unit tests; link job references in `decisions.md`. (commit: c1337db — `.github/workflows/backend-ci.yml` runs lint → format:check → typecheck in the `checks` job)
- [x] Add Husky/lint-staged or equivalent automation; document setup/opt-out instructions. (commit: c1337db — Husky pre-commit runs `npm run lint-staged`; lint-staged config applies ESLint + Prettier on staged files)
- [x] Enable ESLint cache/TS incremental builds in CI for stable runtimes; record improvements in `metrics-tracker.md`. (commit: 5172159 — CI now caches `node_modules/.cache/eslint` and `tsconfig.tsbuildinfo`)

## Phase 3 – Extended checks & metrics

- [x] Integrate OpenAPI/Zod schema validation into the static stage and reference scripts in README. (commit: c1337db — added `npm run docs:openapi:check`, CI step, README update)
- [x] Define KPIs (max runtime, zero warnings) and automate reporting via `metrics-tracker.md`. (commit: c1337db — README “KPIs & Maintenance” + metrics tracker rows for lint/typecheck/format/OpenAPI)
- [x] Schedule quarterly/annual review of static tooling; log agenda/outcomes in `decisions.md`. (commit: c1337db — README documents quarterly cadence; future outcomes to be captured in `decisions.md`)
