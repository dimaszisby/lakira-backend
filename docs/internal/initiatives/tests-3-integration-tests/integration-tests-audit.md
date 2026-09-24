# Integration Tests Audit — 2026-01-09

This audit captures the current state of the Lakira backend integration testing layer as of 2026-01-09. It documents what was inspected, key findings, verified assets, and follow-up actions so future contributors can reference a single artifact before continuing the roadmap outlined in the plan/checklist.

## 1. Scope & Inputs

- **Repositories inspected:** `__tests__/integration/api/**`, `__tests__/integration/docs/**`, `__tests__/integration/features/**`, helpers under `__tests__/integration/helpers/`.
- **Tooling/config reviewed:** `jest.config.mjs` (integration project), `jest.setup.ts`, Docker Compose files (`docker-compose.yml`, `docker-compose.test.yml`), `scripts/test-ci.sh`, `.github/workflows/backend-ci.yml`.
- **Documentation cross-referenced:** `docs/ci-cd/backend/**`, `docs/internal/archive/test-classification-2025-12-22.md`, `docs/internal/initiatives/tests-overhaul/phase2-integration-coverage.md`, `.env.test`.
- **Time frame:** Snapshot taken during the integration-doc kit creation (2026-01-09).

## 2. Environment & Command Verification

- Confirmed the canonical commands:
  - `npm run test:integration` (Jest project `integration`, `jest.setup.ts` bootstraps Express + Postgres).
  - `npm run test:integration:coverage` (same project with coverage).
  - `npm run test:ci` / `scripts/test-ci.sh` for Docker-backed runs.
  - `npm run integration:local` (local convenience wrapper that chains migrations + the integration suite, mirroring the CI order).
- Verified `jest.setup.ts` behavior:
  - Starts Express server per worker (port `4000 + JEST_WORKER_ID`).
  - Authenticates with Sequelize and truncates all tables (except migration bookkeeping) before each spec.
  - Skips lifecycle work when `SKIP_DB_LIFECYCLE=true` (documented for tooling that imports helpers).
- Docker Compose stack (`docker-compose.yml` + `docker-compose.test.yml`) provides Postgres + Redis; README instructs running `docker compose -f docker-compose.yml -f docker-compose.test.yml up -d db redis` prior to tests.
- CI workflow (`.github/workflows/backend-ci.yml`, `tests` job) faithfully mirrors the documented sequence: migrations → unit tests → integration tests → coverage collection with artifacts under `coverage/jest-integration`.

## 3. Suite Inventory & Health

- Current suite count: 13 integration suites (6 API, 1 docs, 6 repository-level) covering auth, metrics, metric settings/logs/categories, analytics visualization, Swagger, and backing repositories (metric/user/analytics/logs).
- Helpers:
  - HTTP: `__tests__/integration/helpers/test-utils.ts` handles user registration, auth headers, payload builders for metrics/logs/settings.
  - DB fixtures: `__tests__/integration/helpers/db-fixtures.ts` manages raw model inserts, transactions (`runInTransaction`), new composite builders (`createUserWithCategory`, `seedMetricWithLogs`, `seedDashboardMetric`), and manual table truncation for targeted tests.
- Phase 2 repository coverage tracker (`docs/internal/initiatives/tests-overhaul/phase2-integration-coverage.md`) shows all planned repo suites marked Pass.
- `docs/internal/archive/test-classification-2025-12-22.md` updated to reflect the current state and highlight remaining higher-order gaps (journeys, Redis).

## 4. Findings & Gaps

| Area                       | Finding                                                                                                                                      | Impact                                                                          | Suggested Action                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Runtime / Coverage metrics | No recorded numbers for `npm run test:integration` or coverage since Docker could not be started in the dev environment used for this audit. | Metrics tracker cannot yet prove performance/coverage targets.                  | Run the commands locally (once Compose access is available) and update `metrics-tracker.md`.                                        |
| Redis coverage             | Redis skip logic defaults to off in tests; suites still run without touching cache.                                                          | Cache regressions rely solely on unit tests unless Redis is explicitly enabled. | Use the new `ENABLE_REDIS_INTEGRATION` flag to opt individual suites in once Docker Redis is available, then add cache-aware specs. |
| End-to-end journeys        | Suites validate individual APIs/repos but no cross-feature journey exists (register → configure metric → log -> fetch analytics).            | Real-world flows may regress without holistic coverage.                         | Add journey suites (tracked in checklist Phase 2).                                                                                  |
| Fixtures / seeds           | Analytics suites seed data inline; no reusable dashboard fixtures exist.                                                                     | Duplicate logic, slower suite authoring.                                        | Extend `db-fixtures.ts` with richer factories or introduce seed migrations.                                                         |
| Observability              | No integration-specific coverage thresholds or JUnit artifacts yet (addressed 2026-01-13 via Phase 3 delivery).                              | Harder to enforce quality gates in CI.                                          | Phase 3 tasks: define thresholds, emit JUnit XML, upload artifacts.                                                                 |

## 5. Evidence & References

- README updated with audited facts (commands, layout, environment): `docs/internal/initiatives/tests-3-integration-tests/README.md`.
- Plan/checklist/ticket capture the roadmap derived from this audit:  
  `docs/internal/initiatives/tests-3-integration-tests/integration-tests-plan.md`, `integration-tests-checklist.md`, `integration-tests-ticket.md`.
- ADRs logged to record infra decisions: `docs/internal/initiatives/tests-3-integration-tests/decisions.md`.
- Metrics tracker seeded with placeholders awaiting runtime/coverage numbers: `docs/internal/initiatives/tests-3-integration-tests/metrics-tracker.md`.
- GitHub Actions workflow verifying CI alignment: `.github/workflows/backend-ci.yml`.

## 6. Next Steps (from audit)

1. **Record metrics:** Run `npm run db:migrate:test && npm run test:integration` and the coverage variant locally; update `metrics-tracker.md` with runtime, suite counts, and coverage percentages.
2. **Redis opt-in:** Implement and document a feature flag so selected suites can connect to Redis; add corresponding checklist items and tests.
3. **Journey suite:** Author the onboarding flow under `__tests__/integration/api/journeys/**` to validate multi-step behavior.
4. **Observability:** Extend CI to emit/upload JUnit for integration suites once thresholds are defined.
5. **Fixtures:** Expand helper factories or seed migrations to avoid repetitive analytics setup code.

This audit should be revisited after the Phase 1 checklist items are complete or when major infra changes land (e.g., Redis toggle adoption, new services in CI).
