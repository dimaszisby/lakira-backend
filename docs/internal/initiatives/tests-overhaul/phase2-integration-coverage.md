# Phase 2 – Integration Coverage Tracker

This log tracks repository/application targets that need true DB-backed integration suites. Each row records status, test location, and helper/fixture notes so we can iterate incrementally without losing context.

| Target                                                   | Status | Planned Test Location                                                                                                                                | Notes / TODOs                                                                                                                                                    |
| -------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MetricRepoSequelize` (create/save + transactions)       | done   | `__tests__/integration/features/metric/MetricRepoSequelize.integration.test.ts`                                                                      | Suite now verifies create/save transactional paths plus existsByName, ownership checks, and delete flows against the real DB.                                    |
| `MetricReadRepoSequelize` (cursor pagination + includes) | done   | `__tests__/integration/features/metric/MetricReadRepoSequelize.integration.test.ts`                                                                  | Suite now covers cursor tie-breakers, invalid cursor fallback, filters, sort variants, log limits, and soft-delete filtering.                                    |
| `UserRepositorySequelize` (exists/create/save)           | done   | `__tests__/integration/features/auth/UserRepositorySequelize.integration.test.ts`                                                                    | Suite covers create/save flows, uniqueness guards, and ID/email lookups against the real `users` table (bcrypt hooks included).                                  |
| `MetricSettingsRepositorySequelize`                      | done   | `__tests__/integration/features/metric-settings/MetricSettingsRepositorySequelize.integration.test.ts`                                               | Suite covers create/save/delete/list flows, uniqueness per metric, ownership guards, and cursor pagination filters.                                              |
| `MetricLogRepoSequelize` & query repo                    | done   | `__tests__/integration/features/metric-log/MetricLogRepoSequelize.integration.test.ts`                                                               | Suite covers timestamp uniqueness checks, CRUD ownership validation, and query pagination/filtering via the read repo.                                           |
| `VisualizationReadRepoSequelize`                         | done   | `__tests__/integration/features/analytics/VisualizationReadRepoSequelize.integration.test.ts`                                                        | Suite verifies single-metric viz generation, dashboard aggregation, and cache hits over the actual SQL pipelines.                                                |
| Analytics Redis cache adapters                           | done   | `__tests__/integration/features/analytics/VisualizationCacheRedis.integration.test.ts`, Redis block in `__tests__/integration/api/analytics.test.ts` | Requires `ENABLE_REDIS_INTEGRATION=true`; covers Redis cache hydration + invalidation using the new `seedDashboardWithMetrics` fixture and analytics HTTP flows. |

## Execution Guidance

1. **Fixtures & helpers**
   - Extend `__tests__/integration/helpers/test-utils.ts` or create `__tests__/integration/helpers/db-fixtures.ts` with factory methods for users, metrics, categories, etc.
   - Keep helpers deterministic and idempotent; prefer factory functions returning inserted rows + cleanup handles.
   - `truncateAllTables()` in `db-fixtures.ts` now targets the actual snake_case table names, so repo suites can safely reset state even when `SKIP_DB_LIFECYCLE` toggles the global cleaner.
   - Use `seedDashboardWithMetrics` whenever analytics suites need a repeatable dashboard with multiple metrics/logs/settings without hand-written inserts.

2. **Test structure**
   - Prefer colocating new integration suites under `__tests__/integration/features/<feature>/` to mirror the feature slice.
   - Use descriptive `.integration.test.ts` suffixes to distinguish from the API suites already under `integration/api/`.

3. **Documentation updates**
   - After each suite lands, update this tracker, `docs/internal/archive/test-classification-2025-12-22.md`, and Phase 2 entries in `test-structure-checklist.md`.
   - Note any new helpers or prerequisites in `docs/internal/initiatives/tests-3-integration-tests/README.md`.

4. **Open questions**
   - Do we need seed data migrations for certain suites (e.g., analytics dashboards) or can factories insert data per test?
   - Should we wrap repo-level tests in transactions we roll back after each test to avoid truncating every table?

Use this doc as the single source of truth for Phase 2 progress; once a target reaches (pass), include a reference (commit hash or PR link) for auditing.
