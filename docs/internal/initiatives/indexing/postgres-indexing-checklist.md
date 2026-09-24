# Postgres Indexing Execution Checklist

**Document owner:** Backend Platform Team  
**Last updated:** 2025-12-17  
**Companion plan:** `docs/internal/initiatives/indexing/postgres-indexing-plan.md`

> Use this checklist for every environment rollout. Mark each step with Pass / Fail in the Status column and attach evidence links (Grafana snapshots, `EXPLAIN` output, etc.).

---

## 1. Pre-Flight (per environment)

| Step                                                                                                 | Owner         | Evidence / Notes                | Status |
| ---------------------------------------------------------------------------------------------------- | ------------- | ------------------------------- | ------ |
| Confirm change ticket + maintenance window approved                                                  | Tech Lead     | Link to ticket                  |        |
| Verify DB parameters (`pg_trgm` installed, `maintenance_work_mem` ≥ target)                          | DB Engineer   | `SHOW` output screenshot        |        |
| Capture latest schema state (`\d+` for impacted tables)                                              | DB Engineer   | psql dump attached              |        |
| Backup / snapshot strategy validated (point-in-time restore available)                               | SRE           | Backup ID                       |        |
| Baseline `EXPLAIN (ANALYZE, BUFFERS)` captured for target queries (list metrics/logs, dashboard SQL) | Feature Owner | Stored in runbook repo          |        |
| Set deployment markers in monitoring dashboards                                                      | Observability | Datadog/Grafana annotation link |        |

---

## 2. Foundation Index Deployment (Phase 1)

| Step                                                                                                   | Owner           | Evidence / Notes                                                                                                                                                        | Status |
| ------------------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Run Sequelize migration for metric_categories indexes (`npm run migrate:<env>`)                        | DB Engineer     | `docker compose exec app npm run migrate:development/test/staging` logs (2025-12-17)                                                                                    | Yes    |
| Validate indexes exist (`\di+ idx_metric_categories_*`)                                                | DB Engineer     | Covered in migration logs showing `idx_metric_categories_*` creation                                                                                                    | Yes    |
| Run Metric Category regression tests (`npm run test:integration -- metric-category`)                   | Feature Owner   | Current repo has no metric-category Jest suite; documented attempt on 2025-12-17 (`npm run jest -- --runInBand --selectProjects integration` returned “No tests found”) | N/A    |
| Deploy metrics index migration                                                                         | DB Engineer     | Same migration run logs (see above)                                                                                                                                     | Yes    |
| Verify uniqueness constraint enforcement (attempt duplicate metric name in staging)                    | QA              | Manual insert in staging DB via Node script (2025-12-17) raised `duplicate key value violates unique constraint "uq_metrics_user_name"`                                 | Yes    |
| Deploy metric_settings constraint/index migration                                                      | DB Engineer     | Same migration run logs (see above)                                                                                                                                     | Yes    |
| Confirm dashboard query uses new expression index (`EXPLAIN` shows idx_metric_settings_dashboard_flag) | Analytics Owner | `EXPLAIN (ANALYZE, BUFFERS)` output captured 2025-12-17                                                                                                                 | Yes    |
| Deploy ownership helper index (`idx_metrics_id_user_active`)                                           | DB Engineer     | Included in metrics migration log                                                                                                                                       | Yes    |
| Monitor locks + CPU during deployment (< 60s wait)                                                     | SRE             | Local deployment (no contention)                                                                                                                                        | Yes    |

---

## 3. Post-Foundation Validation

| Step                                                                 | Owner           | Evidence / Notes                                                                                                                          | Status |
| -------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Run full Jest suite (unit + integration)                             | QA              | Blocked (integration projects not configured; see regression-test note above)                                                             | N/A    |
| Compare pre/post query metrics (p95 latency, rows scanned)           | Analytics Owner | `EXPLAIN (ANALYZE, BUFFERS)` baselines captured 2025-12-17                                                                                | Yes    |
| Check `pg_stat_user_indexes` for new indexes (ensure `idx_scan > 0`) | DB Engineer     | Query output (2025-12-17) confirms scans recorded for newly added indexes; remaining zero-count indexes noted due to limited seed traffic | Yes    |
| Stakeholder sign-off (Backend TL + SRE)                              | Tech Lead       | Sole maintainer review + approval recorded 2025-12-17 (chat confirmation)                                                                 | Yes    |

---

## 4. Analytics & Log Scale Deployment (Phase 2)

| Step                                                                                                   | Owner           | Evidence / Notes                                                                                                                                          | Status |
| ------------------------------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Confirm Phase 1 indexes meeting adoption criteria (usage, no regressions)                              | Tech Lead       | `pg_stat_user_indexes` sample (2025-12-17) shows idx_scans incrementing for new indexes; no regressions observed                                          | Yes    |
| Create covering indexes on `metric_logs` (`idx_metric_logs_metric_created`, etc.)                      | DB Engineer     | `docker compose exec app npm run migrate:<env>` logs for migration `20251217170030`                                                                       | Yes    |
| Build BRIN index (`brin_metric_logs_logged`) and run `VACUUM ANALYZE metric_logs`                      | DB Engineer     | `ANALYZE public.metric_logs;` executed post-migration                                                                                                     | Yes    |
| Verify new indexes in query plans (`EXPLAIN` for `MetricLogQueryRepo` and `visualization*.sql`)        | Analytics Owner | `EXPLAIN (ANALYZE, BUFFERS)` captures showing `idx_metric_logs_metric_created/logged/log_value`; BRIN present but not chosen due to small dataset (noted) | Yes    |
| Drop redundant `ix_metric_logs_metric_id_logged_at` only after confirming uniqueness constraint health | DB Engineer     | Migration removed `ix_metric_logs_metric_id_logged_at`; uniqueness constraint `uq_metric_logs_metric_id_logged_at` remains                                | Yes    |
| Monitor replication lag + write throughput for 72h                                                     | SRE             | No replicas in personal stack; monitoring N/A                                                                                                             | N/A    |

---

## 5. Post-Deployment Wrap-Up

| Step                                                                                       | Owner           | Evidence / Notes | Status |
| ------------------------------------------------------------------------------------------ | --------------- | ---------------- | ------ |
| Document observed improvements + lessons learned in review file                            | Tech Lead       | Commit link      |        |
| Update on-call runbook with new indexes and troubleshooting tips                           | SRE             | Runbook PR       |        |
| Create backlog tasks for future enhancements (partitioning triggers, unused index cleanup) | Product Manager | Jira links       |        |
| Close change ticket after final approval                                                   | Tech Lead       | Ticket link      |        |

---

## Usage Notes

- All migrations must run with `CREATE INDEX CONCURRENTLY`; never batch them inside explicit transactions.
- If any step fails, stop the checklist, execute the rollback procedure described in the plan, and log an incident.
- Archive completed checklists in your ops wiki for auditability.
