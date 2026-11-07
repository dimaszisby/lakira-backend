# Test Structure Checklist

## Phase 0 – Confirm & prepare

- [x] Review `docs/internal/archive/test-classification-2025-12-22.md` with feature owners; adjust any disputed rows.
- [x] Sign off the move map in `docs/internal/archive/test-structure-move-plan-2025-12-22.md`.
- [x] Decide whether `__tests__/integration/helpers/test-utils.ts` stays put or moves into a shared test-support package.
- [x] Document env prerequisites for integration runs (see `docs/internal/initiatives/tests-3-integration-tests/README.md` for DB/Redis expectations).

## Phase 1 – Create folders & move suites

- [x] Create `__tests__/unit/` and `__tests__/integration/` directories in git.
- [x] Move each unit suite listed in the move plan into `__tests__/unit/**` (retain feature subfolders).
- [x] Move `analytics.test.ts`, `auth.test.ts`, `metric*.test.ts`, and `docs/swagger.test.ts` into `__tests__/integration/api/**` or `__tests__/integration/docs/**`.
- [x] Relocate `__tests__/integration/helpers/test-utils.ts` and update all import statements.
- [x] Run `npm run lint` plus `npm run test:unit` to ensure unit suites still pass.

## Phase 2 – Tighten application & repo coverage

- [x] Create Phase 2 tracker (`docs/internal/initiatives/tests-overhaul/phase2-integration-coverage.md`) listing targets + status.
- [x] Identify repositories/use-cases that should gain DB-backed integration coverage (e.g., `MetricRepoSequelize`, `MetricReadRepoSequelize`, `UserRepositorySequelize`) and capture them in the tracker.
- [x] For each target, add a new suite under `__tests__/integration/features/**` that seeds fixtures via Sequelize + migrations.
- [x] Keep the existing mocked suite in `unit/` to cover edge cases without DB cost.
- [x] Expand integration helpers/fixtures as needed (factory functions, DB seed utilities).

## Phase 3 – Update docs & coverage config

- [x] Apply the multi-project `jest.config.mjs` and new setup files from `test-tooling-recommendations-2025-12-22.md`.
- [x] Update `package.json` scripts for `test`, `test:unit`, `test:integration`, `test:contract:*` per recommendations.
- [x] Refresh `docs/internal/initiatives/tests-2-unit-tests` and `docs/internal/initiatives/tests-3-integration-tests` to describe the new layout, scripts, and expectations.
- [x] Document helper usage (e.g., `withTestEnv`, integration helpers) and naming conventions.
- [x] Enable coverage collection and confirm `coverage/jest` artifacts are generated locally.

## Phase 4 – Align CI & rollout

- [x] Update backend CI workflows to run `lint`, `typecheck`, `test:unit`, `test:integration`, and contract suites in explicit steps/jobs.
- [x] Ensure Docker Compose or service containers start Postgres/Redis for integration tests in CI.
- [x] Archive/upload coverage artifacts from unit + integration jobs.
- [x] Update `docs/ci-cd/backend/**` guidance to reference the new scripts and folder structure.
- [x] Communicate the new workflow to the team (Slack/README) and capture lessons learned for future feature migrations.
