# Dead and duplicated code — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `b0a6ee9` (#210).

## Acceptance criteria

- **AC-1** — `src` holds one `TransactionPort` declaration and one `SequelizeTransactionPort`.
  _Why:_ R11's rest (D-01).
- **AC-2** — No `index.ts` under `src/features` re-exports from `./feature.js`, and
  `architecture.test.ts` fails on one that does. _Why:_ X47 (D-02).
- **AC-3** — `src/utils/db-helper.ts` exports only `validateMetricAccess`. _Why:_ X50 (D-03).
- **AC-4** — No `import type {}` in `src`; nothing under `src/tests`; every `build*Feature` names
  its parameter `overrides`; each uncommented cast is commented or gone. _Why:_ X51 (D-04, D-05).
- **AC-5** — Every gate passes, the OpenAPI spec is unchanged, and `dist` holds no `tests/`.
  _Why:_ no behaviour change.

## Phase 0 — kit and branch

- [x] `refactor/architecture-dead-code` cut with `--no-track` from `origin/dev` at `b0a6ee9`; HEAD
      and upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-04; D-05 added at the moment
      it was taken
- [x] #210's loose ends: `single-token-signer` D-01 and D-02 Accepted, README Done; B-64's Closed
      row names `#210 (b0a6ee9)`; "As of" `b0a6ee9`

## Phase 1 — a guard first

- [x] `architecture.test.ts` › a feature's index.ts does not export its build function: failed on
      `dev`, naming all six `index.ts` (AC-2)

## Phase 2 — the changes

- [x] D-01: shared port and adapter; auth's and metric's copies deleted; the use cases, both
      `feature.ts` and three unit tests repointed. Found while implementing: a third port in
      auth's `RefreshTokenRepository.ts`, implemented by `RefreshTokenRepositorySequelize` and
      handed to `RotateRefreshToken`; folded into the shared one (D-01)
- [x] D-02: the six re-exports removed
- [x] D-03: five `db-helper.ts` exports and their tests deleted
- [x] D-04: `env-test-utils.ts` moved to `__tests__/helpers/`; `jest.setup.unit.ts` and ten test
      files repointed; `feature-boundaries.lint.test.ts` no longer lists the old path; a
      one-file ESLint exemption for its `process.env`
- [x] X51: twelve empty imports removed; metric-log's `deps` renamed `overrides`; auth's cast
      removed (D-05), the stats cast commented
- [x] Lint test fixtures naming `TransactionPort` paths left as they are: they are spellings tested
      against a file name

## Phase 3 — gates, review, docs

- [x] Gates, below
- [x] Review of the diff. The unit count fell by 15, not the 13 expected: `architecture.test.ts`
      generates one case per file in a feature's `application/`, and the two deleted ports were
      two of them. The shared port is held by the same rule through lint
      (`src/shared/application` gets the application allowlist and the infrastructure ban).
      `npm run build` does not empty `dist`, so a local `dist/tests/` survives from earlier
      builds; a build into an empty directory has none
- [x] ADR-0022 status note (D-01)
- [x] `docs/tutorials/your-first-feature-slice.md` no longer says two `TransactionPort`s exist
- [x] Register: B-83's item names this slice and the branch
- [x] Notion Part 2: none

## Discovered

- The third `TransactionPort` and its adapter in auth's refresh-token code: in scope (AC-1), D-01.

## Acceptance

- [x] AC-1 — `grep` for the interface and the class under `src` finds one of each
- [x] AC-2 — `architecture.test.ts` › a feature's index.ts does not export its build function
- [x] AC-3 — `db-helper.ts`'s only export is `validateMetricAccess`
- [x] AC-4 — no `import type {}` and no `src/tests`; all six `build*Feature` take `overrides`;
      auth's cast gone, the stats cast commented
- [x] AC-5 — the gates below; `tsc -p tsconfig.build.json` into an empty directory emits no
      `tests/`

## Gates

Node 24.22.0; integration against throwaway Postgres 18 and Redis 7, migrated with `migrate:test`.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 149 suites, 1525 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 303 tests passed (6 skipped),
      thresholds met
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean, spec unchanged
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
