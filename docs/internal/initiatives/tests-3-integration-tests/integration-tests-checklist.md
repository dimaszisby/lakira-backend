# Integration Tests Checklist

## Phase 0 – Baseline Audit

- [x] Inventory integration suite layout (`api/`, `docs/`, `features/`, helpers) and document results in README. (2026-01-09 – this change.)
- [x] Confirm commands/scripts (`test:integration`, `test:integration:coverage`, `test:ci`, Docker Compose stack) line up with CI docs. (2026-01-09 – this change.)
- [x] Capture outstanding tool/infra gaps (Redis skip behavior, fixture coverage, missing metrics) and move them into plan/checklist for tracking. (2026-01-09 – this change.)

## Phase 1 – Environment Hardening & Tooling

- [x] Document `.env.test`, Docker Compose bootstrap, migration requirements, and `SKIP_DB_LIFECYCLE` usage in README. (2026-01-09 – this change.)
- [x] Provide a committed `.env.test.example` (or README snippet) listing required vars so new contributors can mirror the setup quickly. (2026-01-12 – `.env.test.example` added + referenced in README.)
- [x] Add a dedicated script/Make target (e.g., `npm run integration:local`) that chains `db:migrate:test` + `test:integration` for local runs. (2026-01-12 – `npm run integration:local` script published.)
- [x] Introduce a feature flag (e.g., `ENABLE_REDIS_INTEGRATION=true`) so suites can opt into real Redis usage; update `redis-client.ts` + `jest.setup.ts` accordingly. (2026-01-12 – flag parsed via `zodEnv`, `.env.test.example`, and `redis-client.ts`.)
- [x] Expand `__tests__/integration/helpers/db-fixtures.ts` with reusable dashboard/category fixtures so analytics suites avoid repetitive inserts. (2026-01-12 – `createUserWithCategory`, `seedMetricWithLogs`, `seedDashboardMetric` helpers added and adopted by analytics repo suites.)
- [x] Capture runtime + suite counts for `npm run test:integration` once Docker services are available locally. (2026-01-12 – `npm run integration:local` completed in ~32.5 s after Compose stack was running; metrics tracker updated.)
- [x] Capture coverage snapshot via `npm run test:integration:coverage` and record values in `metrics-tracker.md`. (2026-01-12 – coverage run + `npx jest --coverageReporters json-summary` produced 77.17 % statements / 49.30 % branches / 76.23 % functions / 78.57 % lines; logged in metrics tracker.)

## Phase 2 – Coverage Depth & User Journeys

- [x] Add an end-to-end onboarding journey suite (register → create category/metric → configure metric settings → log entries → fetch analytics) under `__tests__/integration/api/journeys`. (2026-01-13 – `onboarding.integration.test.ts` added with full E2E assertions.)
- [x] Extend API suites to cover duplicate metric log timestamps (expecting HTTP 409/422) rather than exclusively relying on repository tests. (2026-01-13 – create/update flows return HTTP 409 with new regression specs.)
- [x] After enabling Redis toggles, create integration tests that verify analytics cache hydration/invalidations (e.g., log metrics → ensure cached dashboards refresh). (2026-01-13 – Redis-gated analytics API block + `features/analytics/VisualizationCacheRedis.integration.test.ts` cover cache hydration + invalidation.)
- [x] Add fixtures or migrations that seed reusable dashboards/visualizations so analytics tests do not rebuild heavy data every run. (2026-01-13 – `seedDashboardWithMetrics` helper seeds multi-metric dashboards for analytics suites.)
- [x] Keep `docs/internal/initiatives/tests-overhaul/phase2-integration-coverage.md` updated when new repository targets or helpers are introduced (reference commit hashes in the tracker). (2026-01-13 – tracker includes Redis cache coverage + helper notes.)

## Phase 3 – Observability & Enforcement

- [x] Decide on and enforce Jest coverage thresholds for the `integration` project (mirroring or adjusting the unit targets) once baseline data exists. (2026-01-13 – `jest.config.mjs` now enforces ≥70 % statements / 45 % branches / 70 % functions / 70 % lines for integration suites.)
- [x] Add `jest-junit` (or reuse existing dependency) to emit `coverage/junit/integration.xml` and upload it from `.github/workflows/backend-ci.yml`. (2026-01-13 – per-project reporters emit `coverage/junit/unit.xml` + `coverage/junit/integration.xml` for CI artifacts.)
- [x] Define flake handling guidance (retry strategy, triage owners) and log the process in `incidents.md`. (2026-01-13 – flake playbook entry documents retries, owners, and incident logging expectations.)
- [x] Schedule quarterly KPI reviews for integration metrics (align with unit/static review cadence) and capture notes in `metrics-tracker.md`. (2026-01-13 – tracker notes call for reviews the first work week of Mar/Jun/Sep/Dec.)

## Phase 4 – Redis Nightly CI Coverage _(do not start until `docs/internal/initiatives/tests-4-contract-tests/**` is implemented)_

- [ ] Draft the Redis-nightly plan in README/plan/checklist, clearly noting that the work is blocked by contract tests and outlining env requirements (Redis service, env vars, runtime expectations).
- [ ] Update `integration-tests-ticket.md` with acceptance criteria + dependencies for the Redis-enabled CI job (workflow sketch, ENABLE_REDIS_INTEGRATION default strategy, owner).
- [ ] Add a new row to `metrics-tracker.md` for “Redis nightly runtime/coverage” and populate it once the contract test milestone unblocks the effort.
- [ ] Implement the GitHub Actions workflow (or script entrypoint) that runs `ENABLE_REDIS_INTEGRATION=true npm run test:integration(:coverage)` on a nightly schedule, capturing artifacts + alerts; document rollback steps in `decisions.md`.
