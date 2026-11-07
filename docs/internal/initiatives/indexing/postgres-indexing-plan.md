# Postgres Indexing Overhaul Plan

**Document owner:** Backend Platform Team  
**Last updated:** 2025-12-17  
**Source review:** `docs/internal/initiatives/indexing/postgres-indexing-review.md`

---

## 1. Background & Drivers

- Metrics, categories, settings, and log workloads currently rely on table scans for user-scoped pagination, analytics fan-out, and ownership validation.
- The review document enumerates the missing indexes and uniqueness guarantees that would unblock future scale, lower p95 latency, and reduce risk of phantom duplicates.
- Goal: ship a production-safe index rollout across all environments with zero downtime and measurable performance improvement.

### KPIs / Success Criteria

1. p95 latency for `listMetrics`, `listMetricLogs`, and dashboard SQL drops by ≥35% under production traffic.
2. `pg_stat_user_indexes` reports ≥1k `idx_scan` events per added index within 14 days (indicating adoption).
3. No slow-query alerts or lock contention incidents triggered during migration windows.

---

## 2. Scope

- **Foundation Index Set** (Phase 1):
  - `metric_categories`: user-scoped partial index, unique name index, trigram search index.
  - `metrics`: user-scoped created/updated indexes, unique name constraint, category/original metric indexes.
  - `metric_settings`: uniqueness on `metric_id`, active metric index, dashboard flag expression index.
  - Ownership helper on `metrics (id, user_id)` for cross-table joins.
- **Analytics & Log Scale** (Phase 2):
  - `metric_logs`: replace duplicate b-tree with targeted covering indexes, add BRIN for range scans.
- **Operational Enablement**:
  - Sequelize migrations leveraging `CREATE INDEX CONCURRENTLY`.
  - Baseline and post-rollout query plans captured via `EXPLAIN (ANALYZE, BUFFERS)`.
  - Updated runbooks/checklists (see `postgres-indexing-checklist.md`).

### Out of Scope

- Table partitioning, archival, or vacuum policy revamps (tracked separately).
- Application-level refactors (e.g., switching search semantics) beyond ensuring ORM definitions align with new constraints.

---

## 3. Stakeholders & Responsibilities

| Role                                    | Responsibilities                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| Tech Lead (Backend Platform)            | Approve plan, coordinate release windows, own KPI tracking.                            |
| DB Engineer / SRE                       | Execute migrations, monitor Postgres health, own rollback.                             |
| Feature Teams (Auth, Metric, Analytics) | Validate functional behavior, own query plan captures, sign off on regression testing. |
| QA / Observability                      | Update dashboards/alerts, watch for anomaly signals (latency, locks, dead tuples).     |

---

## 4. Delivery Approach

### Phase 0 – Preparation (1 sprint)

1. **Artifacts:** finalize plan & checklist documents; file migration tickets per index group.
2. **Environment readiness:** confirm `pg_trgm` extension availability, verify `CONCURRENTLY` privileges, ensure `maintenance_work_mem` sized appropriately (≥1GB recommended for production).
3. **Baselining:** capture current `EXPLAIN` plans for:
   - `MetricReadRepoSequelize.listMetrics`
   - `MetricCategoryRepoSequelize.list`
   - `MetricSettingsRepositorySequelize.listByCursor`
   - `MetricLogQueryRepoSequelize.listLogs`
   - `visualization*.sql` dashboard query (single and multi-metric)
4. **Rollback assets:** take an on-demand logical backup (pg_dump) and snapshot the `metric_logs` index definitions for diffing.

### Phase 1 – Foundation Indexes (1 sprint)

1. **Implementation:** create Sequelize migrations grouped by logical area (categories, metrics, settings). Each migration:
   - Uses `queryInterface.sequelize.query('CREATE INDEX CONCURRENTLY ...')`.
   - Re-runnable (guards via `IF NOT EXISTS` or catches duplicate errors).
   - Adds comments referencing review doc lines for traceability.
2. **Deployment order:** Dev → Test → Staging → Prod. Validate each environment before promoting.
3. **Validation:**
   - Run automated test suites (`npm run test:integration`) focusing on repositories touched.
   - Re-run the captured `EXPLAIN` statements and compare `cost`, `rows`, and `actual time`—ensure new indexes appear in plans.
   - Monitor `pg_stat_activity` for locks; abort if any DDL waits > 60s (as per checklist).
4. **Sign-off:** Product owners confirm functional parity, SRE signs off after 24h monitoring.

### Phase 2 – Analytics & Log Scale (1 sprint)

1. **Pre-checks:** ensure Phase 1 indexes report sustained usage; confirm BRIN support available.
2. **DDL sequencing:**
   - Create new indexes (`idx_metric_logs_metric_created`, `idx_metric_logs_metric_logged`, `idx_metric_logs_metric_log_value`, `brin_metric_logs_logged`).
   - Backfill BRIN summarization with `REINDEX` if necessary.
   - Drop redundant `ix_metric_logs_metric_id_logged_at` only after the unique constraint is validated (or re-create the unique constraint as a single unique index and remove the explicit duplicate).
3. **Analytics verification:** execute dashboard SQL before/after; ensure bucket queries leverage the new covering + BRIN indexes.
4. **Monitoring window:** 72 hours of elevated monitoring on `metric_logs` write latency and replication lag.

### Phase 3 – Retrospective & Future Enhancements

1. Evaluate need for monthly partitioning once `pg_class.reltuples` for `metric_logs` exceeds the agreed threshold (e.g., 50M).
2. Document any new insights in the review file and create backlog items for subsequent improvements.

---

## 5. Migration Execution Standards

- **Naming:** `idx_<table>_<purpose>` for non-unique indexes, `uq_<table>_<columns>` for unique constraints, `brin_<table>_<column>` for BRIN.
- **Transactions:** each `CREATE INDEX CONCURRENTLY` must run outside wrapped transactions; Sequelize migration files should respect this.
- **Concurrency:** limit to 2 concurrent index builds in production to avoid bloating `maintenance_work_mem`.
- **Observability hooks:** annotate Datadog / Grafana dashboards with deployment markers for correlation.

---

## 6. Validation Plan

1. **Functional tests:** run the full Jest suites covering repositories that rely on new constraints (metric CRUD, settings, analytics).
2. **Performance tests:** optional load test or replay with production-like data to measure improvement.
3. **Metrics:** track `pg_stat_statements` for targeted query fingerprints; store pre/post averages.
4. **Checklist linkage:** every validation step references an item in `postgres-indexing-checklist.md`.

---

## 7. Rollback Plan

- If a migration fails or causes regression:
  1. Stop subsequent index builds; mark the release as failed.
  2. Drop the newly created index via `DROP INDEX CONCURRENTLY IF EXISTS ...`.
  3. Restore previous constraint behavior if impacted (e.g., re-enable old duplicate indexes before dropping them).
  4. Use the captured backups only if data corruption occurs (unlikely for index-only changes).
  5. Document incident postmortem and update plan/checklist to cover the discovered gap.

---

## 8. Risks & Mitigations

| Risk                                                           | Impact                                       | Mitigation                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Long-running `CREATE INDEX` blocks due to maintenance settings | Deployment delays, potential lock contention | Schedule during low-traffic windows, increase `maintenance_work_mem`, use `statement_timeout` safeguards.  |
| Hot tables (metric_logs) causing replication lag               | Stale read replicas, delayed analytics       | Build indexes sequentially, monitor replica lag, pause if lag > 30s.                                       |
| Application regressions due to new unique constraints          | Failing writes                               | Dry-run in staging with anonymized prod data; implement graceful error handling before production rollout. |
| Index bloat / unused indexes                                   | Increased storage, slower writes             | Monitor `pg_stat_user_indexes.idx_scan`; drop unused indexes after 30 days.                                |

---

## 9. References

- Review findings: `docs/internal/initiatives/indexing/postgres-indexing-review.md`
- Checklist/runbook: `docs/internal/initiatives/indexing/postgres-indexing-checklist.md`
- Sequelize migration templates: `src/migrations/2025010916035x-*.cjs`
