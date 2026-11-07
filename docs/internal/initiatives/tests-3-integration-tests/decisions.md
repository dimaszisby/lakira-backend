# Integration Tests Decision Log

## INT-ADR-001 – Compose-Backed Postgres & Migrations (Accepted 2026-01-09)

- **Context:** Integration suites were running ad-hoc against whichever Postgres instance happened to be available, leading to inconsistent instructions between local machines and CI.
- **Decision:** Standardize on the Docker Compose stack defined in `docker-compose.yml` + `docker-compose.test.yml` (Postgres + Redis) for local runs, and keep CI provisioning aligned via `.github/workflows/backend-ci.yml`. Developers run `docker compose ... up -d db redis`, followed by `npm run db:migrate:test` before executing `npm run test:integration`.
- **Consequences:** Contributors—and Codex—have deterministic steps to boot dependencies. CI mirrors the same commands, so failures are reproducible. Future infra changes must update both the compose files and README to maintain parity.
- **References:** `docs/internal/initiatives/tests-3-integration-tests/README.md`, `.github/workflows/backend-ci.yml`, `scripts/test-ci.sh`, `docker-compose.yml`, `docker-compose.test.yml`.
- **Note (2026-09-24):** the procedure above still stands and needs only `docker-compose.yml` (its init script creates `lakira_test_db`). `docker-compose.test.yml` and `scripts/test-ci.sh` were retired — see [`retire-test-ci` D-01](../retire-test-ci/decisions.md).

## INT-ADR-002 – Raw SQL Truncation Between Specs (Accepted 2026-01-09)

- **Context:** Integration suites need clean tables per spec. Early implementations relied on ad-hoc helper calls, which sometimes missed new tables and caused flaky tests.
- **Decision:** Use `jest.setup.ts` to run a raw SQL query before each spec that truncates every `public` table except `SequelizeMeta`/`SequelizeData`. For targeted repository tests (when `SKIP_DB_LIFECYCLE=true`), keep a curated list inside `__tests__/integration/helpers/db-fixtures.ts::truncateAllTables`.
- **Consequences:** Every suite starts with a clean DB while preserving migration history. Adding tables requires either updating the helper list or ensuring the SQL query accounts for them. Runtime remains acceptable because truncation happens via raw SQL rather than ORM iteration.
- **References:** `jest.setup.ts`, `__tests__/integration/helpers/db-fixtures.ts`, `docs/internal/initiatives/tests-3-integration-tests/README.md`.

## INT-ADR-003 – Redis Disabled by Default with Opt-In Flag (Accepted 2026-01-12)

- **Context:** `redis-client.ts` originally skipped connecting when `NODE_ENV=test`, keeping suites fast but preventing cache coverage.
- **Decision:** Keep Redis disabled by default yet introduce `ENABLE_REDIS_INTEGRATION=true` for runs that want real Redis behavior. The flag is parsed via `zodEnv`, surfaced in `.env.test.example`, and respected inside `redis-client.ts`.
- **Consequences:** Developers/CI can selectively enable Redis without changing baseline workflows; cache-focused suites merely need to export the flag before invoking `npm run integration:local`. Future PRs should document when Redis is required and fail fast if the service is unreachable.
- **References:** `src/config/zodEnv.ts`, `src/utils/redis-client.ts`, `.env.test.example`, `docs/internal/initiatives/tests-3-integration-tests/README.md`, `integration-tests-checklist.md`.

## INT-ADR-004 – Duplicate Metric-Log Collisions Return HTTP 409 (Accepted 2026-01-13)

- **Context:** Integration suites previously asserted that duplicate metric-log timestamps returned HTTP 400. Product requirements classify duplicates as a true conflict, and Phase 2 called for HTTP-level regression coverage (create + update flows) to align with repository guards.
- **Decision:** Change `CreateMetricLog` and `UpdateMetricLog` to throw `AppError(..., 409)` when a timestamp already exists for the metric. Update API integration tests to enforce the new status and cover update conflicts alongside create conflicts.
- **Consequences:** Clients receive a semantically correct 409 Conflict, aligning with REST expectations. Any consumers relying on 400 must adjust, but the integration suite now prevents regressions. Repository-level logic remains unchanged.
- **References:** `src/features/metric-log/application/use-cases/CreateMetricLog.ts`, `src/features/metric-log/application/use-cases/UpdateMetricLog.ts`, `__tests__/integration/api/metric-log.test.ts`, `docs/internal/initiatives/tests-3-integration-tests/checklist.md`.

## INT-ADR-005 – Project-Specific Coverage & JUnit Reporting (Accepted 2026-01-13)

- **Context:** Integration coverage targets were documented but not enforced, and CI only emitted a single `unit.xml`, making it impossible to distinguish failures per layer.
- **Decision:** Configure Jest projects with their own coverage thresholds (unit ≥60/40/55/60, integration ≥70/45/70/70) and attach dedicated `jest-junit` reporters so unit and integration XML artifacts are emitted separately (`coverage/junit/unit.xml`, `coverage/junit/integration.xml`).
- **Consequences:** Coverage regressions now fail the relevant Jest project immediately. CI dashboards/interviews can ingest isolated XMLs, and artifacts align with the enforcement story captured in the docs. Contributors must keep coverage above the thresholds (add/adjust tests as needed).
- **References:** `jest.config.mjs`, `docs/internal/initiatives/tests-3-integration-tests/README.md`, `integration-tests-plan.md`, `integration-tests-checklist.md`.

## INT-ADR-006 – Redis Remains Opt-In Until Dedicated CI Coverage Exists (Accepted 2026-01-14)

- **Context:** Phase 2 introduced Redis-backed specs guarded by `ENABLE_REDIS_INTEGRATION`, and we revisited whether Redis should become mandatory for all integration runs.
- **Decision:** Keep Redis disabled by default (flag opt-in) so day-to-day `npm run test:integration` and PR CI jobs stay fast and deterministic even when Redis is unavailable. Redis suites run when contributors (or a future nightly CI job) explicitly export `ENABLE_REDIS_INTEGRATION=true`.
- **Consequences:** Cache regressions continue to be caught via targeted runs without imposing the infra dependency on every developer. Docs must keep the toggle visible, and metrics should log Redis-enabled runs to prove coverage. We'll flip the default only after a stable dedicated Redis job exists.
- **References:** `docs/internal/initiatives/tests-3-integration-tests/README.md`, `integration-tests-plan.md` (“Open Questions”), `integration-tests-checklist.md`, `metrics-tracker.md`.

## INT-ADR-007 – Prefer Programmatic Analytics Fixtures over Seed Migrations (Accepted 2026-01-14)

- **Context:** Analytics suites currently rely on helpers like `seedDashboardWithMetrics` to create dashboards/logs on the fly; we evaluated adding seed migrations to avoid repeated inserts.
- **Decision:** Continue to create analytics dashboards/visualizations through test fixtures instead of migrations. Fixtures keep tests isolated, align with the raw-SQL truncation strategy, and avoid polluting migrations with test-only data.
- **Consequences:** Every suite remains self-contained and can tune data to the scenario under test. We avoid extra migration churn and keep truncation fast. If future journeys require heavy shared datasets, revisit with a dedicated seed script rather than schema migrations.
- **References:** `__tests__/integration/helpers/db-fixtures.ts`, `__tests__/integration/features/analytics/**`, `docs/internal/initiatives/tests-3-integration-tests/README.md`, `integration-tests-plan.md`.

## INT-ADR-008 – Retain Raw-SQL Truncation for Repository Suites (Accepted 2026-01-14)

- **Context:** The team questioned whether wrapping each repository spec in transactions (rolled back per test) would outperform the current truncate-all-tables approach defined in `jest.setup.ts`.
- **Decision:** Stick with raw SQL truncation between specs. It provides deterministic cleanup across workers without race conditions, and the current runtime (≈56 s) stays within our KPIs, so the added complexity of per-spec transactions is unjustified.
- **Consequences:** No changes to setup/teardown scripts are needed, and contributors can rely on the same cleanup semantics. We'll keep monitoring runtime in `metrics-tracker.md` and revisit transaction-based isolation if we surpass the 90 s local / 5 m CI thresholds.
- **References:** `jest.setup.ts`, `__tests__/integration/helpers/db-fixtures.ts`, `docs/internal/initiatives/tests-3-integration-tests/integration-tests-plan.md`, `docs/internal/initiatives/tests-3-integration-tests/metrics-tracker.md`.
