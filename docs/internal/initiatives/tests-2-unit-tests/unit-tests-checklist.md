# Unit Tests Checklist

## Phase 0 - Baseline Inventory

- [x] Confirm Jest multi-project config + scripts align with CI expectations (`jest.config.mjs`, `package.json`). (2025-02-26 - verified `test:unit`, `test:unit:coverage`, and SKIP_DB_LIFECYCLE behavior.)
- [x] Capture runtime + suite counts for `npm run test:unit` (~24 s, 27 suites / 92 specs). (2025-02-26 - recorded in `metrics-tracker.md`.)
- [x] Capture coverage snapshot via `npm run test:unit:coverage` (44.7 % statements, 24.1 % branches). (2025-02-26 - stored in README + metrics tracker.)
- [x] Inventory gaps (metric settings repos, routers, cache adapters, shared middleware). (2025-02-26 - summarized in README + plan.)

## Phase 1 - Documentation & Workflow Alignment

- [x] Publish README, workflow guidelines, plan, checklist, ticket, decisions, incidents, and metrics tracker inside `docs/internal/initiatives/tests-2-unit-tests/`. (This change.)
- [x] Record initial ADR(s) covering Jest strategy and coverage posture. (This change - see `decisions.md`.)
- [x] Define builder/factory strategy for shared fixtures (e.g., `tests/factories/metric.ts`) and document usage in guidelines. (2025-12-30 - `__tests__/unit/factories/metric-settings.ts` added + README/guidelines updated.)
- [x] Document lint/format guardrail alignment (Prettier formats; ESLint quotes rule uses `avoidEscape: true`) so contributors know how to satisfy CI static checks. (2026-01-06 - see CI/CD developer guide.)
- [ ] Add example PR template snippet reminding contributors to mention `npm run test:unit` results (coordinate with repo-level docs).

## Phase 2 - Coverage Expansion

- [x] Add suites for metric settings use cases (create/update flows) using mocked repositories. (2025-12-30 - `CreateMetricSettings` + `UpdateMetricSettings` suites.)
- [x] Add suites for remaining metric settings flows (delete, goal achievement, display options). (2025-12-30 - `DeleteMetricSettings`, `UpdateGoalAchievement`, `UpdateDisplayOptions`.)
- [x] Add coverage for metric settings HTTP controller endpoints (create/list/get/update/delete/goal/display). (2025-12-30 - dedicated controller suite validates feature wiring.)
- [x] Add coverage for metric settings repository persistence (Sequelize adapter). (2025-12-30 - `MetricSettingsRepositorySequelize.test.ts` stubs Sequelize models in-memory.)
- [x] Add coverage for metric settings HTTP router guards. (2025-12-30 - `router.test.ts` now mocks Express + cache builders to verify middleware order and cache key generation.)
- [x] Add tests for metric settings cache invalidator adapter. (2025-12-30 - `MetricSettingsCacheInvalidator.test.ts`.)
- [x] Cover shared middleware (cache/error/rate-limit/validation). (2026-01-02 - cache/rate limiter/validation/error middleware suites now ensure deterministic logging and responses.)
- [x] Cover Redis cache layers (`MetricCacheRedis`, `MetricLogCacheRedis`, `VisualizationCacheRedis`) verifying keys, TTLs, and invalidation triggers. (2026-01-02 - metric, metric-log, and visualization Redis adapters now mocked with deterministic key assertions.)
- [x] Expand utilities coverage (`utils/date-io`, `utils/db-helper`, `utils/redis-client`, `shared/cache/logging`). (2026-01-06 - added `__tests__/unit/utils/date-io.test.ts`, `db-helper.test.ts`, `redis-client.test.ts`, and `__tests__/unit/shared/cache/logging.test.ts`.)
- [x] Add coverage for metric category persistence (Sequelize repo + list/cursor helpers). (2026-01-06 - `MetricCategoryRepoSequelize.test.ts` validates CRUD, cursor pagination, and metric count defaults.)
- [x] Cover shared cache key helpers (`shared/cache/keys.ts`). (2026-01-06 - `__tests__/unit/shared/cache/keys.test.ts`.)
- [x] Cover metric log query repository (pagination, filters, cursors). (2026-01-06 - `MetricLogQueryRepoSequelize.test.ts` exercises list/cursor behavior and numeric filters.)
- [x] Add token generator unit tests (`utils/token-generator.ts`). (2026-01-06 - `__tests__/unit/utils/token-generator.test.ts` verifies JWT payload/secret wiring.)
- [x] Cover response formatter helper (`utils/response-formatter.ts`). (2026-01-06 - `__tests__/unit/utils/response-formatter.test.ts` asserts success/error payloads.)
- [x] Cover analytics visualization invalidation adapter (`VisualizationInvalidationAdapter.ts`). (2026-01-06 - `VisualizationInvalidationAdapter.test.ts` ensures scan/del behavior.)

## Phase 3 - Observability & Enforcement

- [x] Decide on Jest coverage thresholds and update `jest.config.mjs` accordingly; document outcome in `decisions.md`. (2026-01-09 – thresholds now ≥60 % statements / ≥40 % branches / ≥55 % functions / ≥60 % lines; see UT-ADR-004.)
- [x] Evaluate adding JUnit/HTML reporters for unit suites and surface them in CI artifacts. (2026-01-09 – `jest-junit` emits `coverage/junit/unit.xml` and README/CI docs link to it.)
- [x] Establish flake tracking process (e.g., rerun command guideline, incident template) once the suite grows. (2026-01-09 – workflow guidelines + `incidents.md` now include template + logging expectations.)
- [x] Review KPIs quarterly (aligned with static-check cadence) and log notes in `metrics-tracker.md` / `decisions.md`. (2026-01-09 – metrics tracker now includes quarterly review row; next check slated for Q2 2026.)
