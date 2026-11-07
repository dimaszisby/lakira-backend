# Lakira Backend – Postgres Indexing Review

**Date:** 2025-12-17  
**Prepared for:** Backend Platform & Analytics teams  
**Database:** PostgreSQL (managed via Sequelize ORM)  
**Scope:** `users`, `metric_categories`, `metrics`, `metric_settings`, `metric_logs`

---

## 1. Executive Summary

- The production schema currently exposes only primary-key and uniqueness indexes, plus one composite index on `metric_logs`. Every high-frequency query (lists, cursor pagination, analytics fan-out) scans on non-indexed predicates such as `user_id`, `deleted_at`, and text searches, creating O(N) latency as data grows beyond a few thousand rows.
- `metric_logs`—the highest-cardinality table powering dashboards (`visualization*.sql`) and log CRUD (`MetricLogQueryRepoSequelize`)—is protected by both a unique constraint and a duplicate b-tree index on `(metric_id, logged_at)`. Range scans on `created_at`, `logged_at`, and `log_value` as well as ownership joins (`metric_id -> metrics.user_id`) currently spill to sequential scans, which will become the dominant production cost.
- Missing relational guarantees (e.g., `metric_settings` should be one-to-one with `metrics`, `metrics.name` should be unique per user) leave gaps between application-level validation and database enforcement, risking phantom duplicates and complicating cache invalidation logic.
- Establishing a targeted set of b-tree, expression, and BRIN indexes—rolled out with `CREATE INDEX CONCURRENTLY` migrations—will cut query latency, unblock analytics, and create space for future partitioning/archival strategy.

---

## 2. Methodology & Inputs

- Schema migrations at `src/migrations/*.cjs` with emphasis on table creation files dated `20250109`.
- Sequelize models for the scoped tables (e.g., `src/features/metric/.../models/*.ts`).
- Query workloads from repositories:
  - Metric catalog & detail: `src/features/metric/infrastructure/persistence/repositories/MetricReadRepoSequelize.ts`.
  - Metric category CRUD & pagination: `src/features/metric-category/infrastructure/persistence/repositories/MetricCategoryRepoSequelize.ts`.
  - Metric settings management: `src/features/metric-settings/infrastructure/persistence/MetricSettingsRepositorySequelize.ts`.
  - Metric log read/write: `src/features/metric-log/infrastructure/persistence/repositories/*`.
  - Analytics fan-out SQL: `src/features/analytics/infrastructure/sql/visualization*.sql.ts`.
- Observed access patterns were translated into predicates/sort keys to determine whether current indexes support them.

---

## 3. Current Index Inventory

| Table               | Existing Indexes                                                                                                            | Notes                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `users`             | PK on `id`; unique constraints on `username`, `email`.                                                                      | Covers current find-by-email/username workload; no case-insensitive support.            |
| `metric_categories` | PK on `id`.                                                                                                                 | No FK or search indexes (`user_id`, `name`, `deleted_at` all unindexed).                |
| `metrics`           | PK on `id`.                                                                                                                 | No coverage for `user_id`, `category_id`, `deleted_at`, or `name`.                      |
| `metric_settings`   | PK on `id`.                                                                                                                 | No uniqueness on `metric_id`; no JSONB expression indexes for dashboard filters.        |
| `metric_logs`       | PK on `id`; unique constraint `uq_metric_logs_metric_id_logged_at`; additional b-tree `ix_metric_logs_metric_id_logged_at`. | Duplicate indexes on same columns; no support for other sort keys or time-series scans. |

> **Gap:** Postgres does not auto-index FK columns, so every `WHERE user_id = ? AND deleted_at IS NULL` clause currently performs seq scans despite being the dominating predicate across repositories.

---

## 4. Workload Analysis & Gaps

### 4.1 Users (`src/features/auth/.../UserRepositorySequelize.ts`)

- Queries: uniqueness checks (`existsByEmail/Username`), direct lookups via `findByEmail`, `findById`.
- Findings:
  - Indexes created via unique constraints already cover exact-match lookups.
  - Authentication expects case-sensitive uniqueness; if future UX requires case-insensitive login, a functional unique index on `LOWER(email)` will be needed.
  - Soft deletes are enabled (`paranoid: true`), but no queries filter `deleted_at` today.
- Action: No immediate change required; monitor requirements for case-insensitive lookups.

### 4.2 Metric Categories (`MetricCategoryRepoSequelize.ts`)

- Queries filter `userId` + `deletedAt: null` (lines 34-140) and perform name `ILIKE` searches with cursor pagination by `createdAt`, `updatedAt`, `LOWER(name)`, and derived `metricCount`.
- Issues:
  - Lack of `(user_id, deleted_at)` index means every category list for a user scans the entire table; this is the first call on most dashboards.
  - No uniqueness guarantee on `(user_id, lower(name))`, so concurrent requests can create duplicate category names despite the repo checking `count`.
  - Name search relies on `%term%` ILIKE; without trigram or GIN indexes, search requires sequential scans and cannot keep pace once categories > ~5k.
  - Derived `metricCount` subquery (`metrics` table) filters `category_id` and `deleted_at`; there is no supporting index on `metrics`.
- Recommendations:
  - Add a partial b-tree index `ON metric_categories (user_id, created_at DESC) WHERE deleted_at IS NULL`.
  - Enforce uniqueness with `UNIQUE (user_id, lower(name)) WHERE deleted_at IS NULL`.
  - Enable `pg_trgm` and create `GIN (LOWER(name) gin_trgm_ops)` to accelerate `ILIKE`.
  - Support the correlated subquery with `metrics (category_id, deleted_at)` partial index (see §4.3).

### 4.3 Metrics (`MetricReadRepoSequelize.ts`)

- Workload: user-scoped lists sorted by `createdAt`, `updatedAt`, `LOWER(name)`, and derived log counts; filters on `categoryId`, text search on `name`, and joins to `metric_category`, `metric_settings`, and `metric_logs` (lines 23-195).
- Issues:
  - No supporting index for `(user_id, deleted_at)` filter + cursor sort keys; every list and count becomes a table scan.
  - `existsByName` uses `count` to prevent duplicates but lacks DB-level enforcement; race conditions can leak duplicates and break caching.
  - Filtering by `category_id` or `original_metric_id` lacks indexes, slowing category dashboards and cloning flows.
  - Soft delete (`deleted_at`) is ubiquitous but unindexed, hurting join filters from other tables (metric_settings/logs).
- Recommendations:
  - Partial covering index `ON metrics (user_id, created_at DESC) WHERE deleted_at IS NULL` (supports default sort). Optionally include `updated_at` via multi-column index or add `idx_metrics_user_updated_at`.
  - Functional unique index `UNIQUE (user_id, lower(name)) WHERE deleted_at IS NULL`.
  - Partial indexes on `(category_id) WHERE deleted_at IS NULL` and `(original_metric_id) WHERE deleted_at IS NULL`.
  - Consider `GIN (LOWER(name) gin_trgm_ops)` to align with name search.

### 4.4 Metric Settings (`MetricSettingsRepositorySequelize.ts`)

- Workload: `findById` enforces ownership via join to `metrics` (lines 38-86); `listByCursor` filters by `metricId`, `isActive`, and sorts by `createdAt`, `updatedAt`, `isActive` (lines 100-205). Dashboard query (`VisualizationReadRepoSequelize.fetchDashboardMetrics`) scans `metric_settings` filtering on JSON attributes `display_options->>'showOnDashboard'` and `is_active`.
- Issues:
  - Schema intends 1:1 relationship between `metrics` and `metric_settings`, but there is no unique constraint on `metric_id`. Duplicate rows would confuse caches and the dashboard query.
  - No index on `(metric_id)` or `(is_active)` for cursor sorting; every list operation scans.
  - Filtering by JSON keys requires expression indexes; currently each dashboard load rewrites the entire table.
- Recommendations:
  - Add `UNIQUE (metric_id)` constraint.
  - Create partial `ON metric_settings (metric_id) WHERE is_active` (covers CRUD and ownership).
  - Add expression index to support dashboard filter: `CREATE INDEX ... ON metric_settings ((COALESCE((display_options->>'showOnDashboard')::boolean, false))) WHERE is_active;`.
  - If priority ordering remains common, index `( (display_options->>'priority')::int )`.

### 4.5 Metric Logs & Analytics (`MetricLogRepoSequelize.ts`, `MetricLogQueryRepoSequelize.ts`, `visualization*.sql.ts`)

- Workload summary:
  - CRUD ensures uniqueness at `(metric_id, logged_at)` (lines 15-78) and fetches logs for ownership via join on `metrics.user_id`.
  - Listing endpoint sorts by `createdAt`, `updatedAt`, `loggedAt`, or `logValue`, and filters by `metricId`, `logValue`, or numeric search (lines 13-199 of the query repo).
  - Analytics SQL (`visualization*.sql.ts`) executes bulk range scans over `metric_logs` per metric or set of metrics, grouping by truncated timestamps and time zone casting.
- Issues:
  - Migration adds both a unique constraint and a separate non-unique index on identical columns, doubling write overhead for no gain.
  - No indexes cover `(metric_id, created_at)` or `(metric_id, log_value)`, forcing sorts to use external memory.
  - Range scans on `logged_at` must read all tuples for a metric even when filtering by time slices; Postgres cannot leverage the existing b-tree for inequality if the predicate is only on `logged_at` (analytics uses `WHERE metric_id IN (...) AND logged_at BETWEEN ...)` but the composite index will still help; however, large time windows across many metrics will still scan most of the table. A BRIN index on `logged_at` (or monthly partitioning) is needed to keep analytics predictable.
  - Ownership checks join `metric_logs` to `metrics` on `metric_id` while filtering `metrics.user_id`; without a covering index on `metrics (id, user_id, deleted_at)`, each join hits the heap.
- Recommendations:
  - Drop the redundant `ix_metric_logs_metric_id_logged_at` once a unique index exists; rely on the unique constraint (or rebuild as `PRIMARY KEY` if `id` is not used externally).
  - Add covering indexes:
    - `ON metric_logs (metric_id, created_at DESC)` for default cursor sorting.
    - `ON metric_logs (metric_id, logged_at DESC)` to align with analytics/time-based sorts (replace the duplicate index).
    - `ON metric_logs (metric_id, log_value)` to support numeric search filters.
  - Add BRIN index `USING brin (logged_at)` (optionally multi-column with `metric_id`) to accelerate long-range aggregations.
  - Evaluate partitioning strategy (by month or by metric) once row counts exceed ~50M to keep indexes lean.

---

## 5. Recommended Index Blueprint

### 5.1 Foundation (sprint-ready, safe to backfill online)

```sql
-- Metric categories
CREATE INDEX CONCURRENTLY idx_metric_categories_user_active
  ON public.metric_categories (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX CONCURRENTLY uq_metric_categories_user_name
  ON public.metric_categories (user_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY gin_metric_categories_name_trgm
  ON public.metric_categories USING gin (lower(name) gin_trgm_ops);

-- Metrics
CREATE INDEX CONCURRENTLY idx_metrics_user_created
  ON public.metrics (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY idx_metrics_user_updated
  ON public.metrics (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX CONCURRENTLY uq_metrics_user_name
  ON public.metrics (user_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY idx_metrics_category_active
  ON public.metrics (category_id)
  WHERE deleted_at IS NULL;

-- Metric settings
ALTER TABLE public.metric_settings
  ADD CONSTRAINT uq_metric_settings_metric
  UNIQUE USING INDEX (
    CREATE UNIQUE INDEX CONCURRENTLY uq_metric_settings_metric
      ON public.metric_settings (metric_id)
  );

CREATE INDEX CONCURRENTLY idx_metric_settings_active_metric
  ON public.metric_settings (metric_id)
  WHERE is_active;

CREATE INDEX CONCURRENTLY idx_metric_settings_dashboard_flag
  ON public.metric_settings (
    (COALESCE((display_options->>'showOnDashboard')::boolean, false))
  )
  WHERE is_active;
```

### 5.2 Analytics & Log Scale

```sql
-- Replace duplicate log index with covering + BRIN combos
DROP INDEX CONCURRENTLY IF EXISTS ix_metric_logs_metric_id_logged_at;

CREATE INDEX CONCURRENTLY idx_metric_logs_metric_created
  ON public.metric_logs (metric_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_metric_logs_metric_logged
  ON public.metric_logs (metric_id, logged_at DESC);

CREATE INDEX CONCURRENTLY idx_metric_logs_metric_log_value
  ON public.metric_logs (metric_id, log_value);

CREATE INDEX CONCURRENTLY brin_metric_logs_logged
  ON public.metric_logs USING brin (logged_at);

-- Ownership joins
CREATE INDEX CONCURRENTLY idx_metrics_id_user_active
  ON public.metrics (id, user_id)
  WHERE deleted_at IS NULL;
```

### 5.3 Forward-looking (after monitoring impact)

- Evaluate monthly partitioning for `metric_logs` when daily inserts exceed ~2M rows. Native declarative partitioning by `logged_at` keeps analytics from touching cold data.
- Consider partial index `ON metric_logs (metric_id) WHERE logged_at >= now() - interval '90 days'` if most UI queries are near-real-time.
- For `metrics` and `metric_categories`, monitor `pg_stat_statements` to decide whether `GIN` indexes meaningfully reduce `ILIKE` latency before committing to their maintenance overhead.

---

## 6. Validation & Operational Checklist

1. **Migrations:** Use `sequelize-cli` to emit `CREATE INDEX CONCURRENTLY` statements. Each statement should be idempotent and wrapped in separate transactions so production traffic remains online.
2. **Query Plans:** Capture current `EXPLAIN (ANALYZE, BUFFERS)` for representative queries (list metrics, list categories, log listing, dashboard SQL) and confirm index usage post-deployment. Store plans in an internal runbook for regression detection.
3. **Monitoring:**
   - Enable `pg_stat_statements` to track mean/95p durations per query fingerprint.
   - Watch `pg_stat_user_indexes` for `idx_scan` counts; unused indexes older than 30 days should be reconsidered.
   - Track bloat via `pgstattuple` or `pg_indexes_size`, especially on `metric_logs`.
4. **Maintenance:** Schedule `VACUUM (FULL)` avoidance by keeping `autovacuum` aggressive on `metric_logs` (high churn table). Consider `REINDEX CONCURRENTLY` quarterly for multi-column indexes.
5. **Backfill Load:** For large tables, build indexes during off-peak hours and throttle via `maintenance_work_mem` plus `statement_timeout` overrides if needed.

---

## 7. Appendix – Query ⇄ Index Mapping

| Code Path                                                                                                                          | Query Characteristics                                                                                                                 | Supporting Index                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `MetricReadRepoSequelize.listMetrics` (`src/features/metric/.../MetricReadRepoSequelize.ts:23-93`)                                 | `WHERE user_id = ? AND deleted_at IS NULL` with sorts on `created_at`, `updated_at`, `LOWER(name)` and optional `category_id` filter. | `idx_metrics_user_created`, `idx_metrics_user_updated`, `uq_metrics_user_name`, `idx_metrics_category_active`.                           |
| `MetricCategoryRepoSequelize.list` (`src/features/metric-category/.../MetricCategoryRepoSequelize.ts:34-151`)                      | User-scoped pagination + `%term%` search + derived metric count.                                                                      | `idx_metric_categories_user_active`, `uq_metric_categories_user_name`, `gin_metric_categories_name_trgm`, `idx_metrics_category_active`. |
| `MetricSettingsRepositorySequelize.listByCursor` (`src/features/metric-settings/.../MetricSettingsRepositorySequelize.ts:100-205`) | Filters on `metric_id`, `is_active`, sorts by `created_at/updated_at/is_active`.                                                      | `uq_metric_settings_metric`, `idx_metric_settings_active_metric`, `idx_metric_settings_dashboard_flag`.                                  |
| `MetricLogQueryRepoSequelize.listLogs` (`src/features/metric-log/.../MetricLogQueryRepoSequelize.ts:13-199`)                       | Ownership enforced via join; sorts on `created_at`, `updated_at`, `logged_at`, `log_value`; filters by `metric_id`.                   | `idx_metric_logs_metric_created`, `idx_metric_logs_metric_logged`, `idx_metric_logs_metric_log_value`, `idx_metrics_id_user_active`.     |
| `visualization*.sql.ts` (`src/features/analytics/infrastructure/sql/*.ts`)                                                         | Time-bucket aggregations over `metric_logs` filtered by metric(s) and `logged_at` range.                                              | `idx_metric_logs_metric_logged`, `brin_metric_logs_logged` (range pruning), future partitions.                                           |

---

### Next Steps

1. Socialize this review with product/analytics stakeholders and align on rollout order (start with Foundation indexes).
2. Draft Sequelize migrations for each index/constraint group, ensuring `CONCURRENTLY` semantics.
3. Capture baseline query plans/metrics before deploying and compare afterward to validate gains.
