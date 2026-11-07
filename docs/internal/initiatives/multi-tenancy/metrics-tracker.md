# Multi-Tenancy — Metrics Tracker

Quantitative tracking for the rollout. Populated as each phase runs.

## Backfill row counts (Phase 2 + Phase 3)

| Table                | Pre-backfill rows | Orgs created | Memberships created | `organization_id` populated | NULL remaining | Owner       | Date | Notes |
| -------------------- | ----------------- | ------------ | ------------------- | --------------------------- | -------------- | ----------- | ---- | ----- |
| `users`              |                   | _N/A_        | _N/A_               | _N/A_                       | _N/A_          | @dimaszisby |      |       |
| `organizations`      | _N/A_             |              | _N/A_               | _N/A_                       | _N/A_          | @dimaszisby |      |       |
| `memberships`        | _N/A_             | _N/A_        |                     | _N/A_                       | _N/A_          | @dimaszisby |      |       |
| `metrics`            |                   | _N/A_        | _N/A_               |                             |                | @dimaszisby |      |       |
| `metric_categories`  |                   | _N/A_        | _N/A_               |                             |                | @dimaszisby |      |       |
| `metric_settings`    |                   | _N/A_        | _N/A_               |                             |                | @dimaszisby |      |       |
| `metric_logs`        |                   | _N/A_        | _N/A_               |                             |                | @dimaszisby |      |       |
| `processed_messages` |                   | _N/A_        | _N/A_               |                             |                | @dimaszisby |      |       |

Verification query (Phase 3): `SELECT COUNT(*) FROM <table> WHERE organization_id IS NULL` must return 0 before adding the NOT NULL constraint.

## Phase rollout

| Phase                                 | Status | PR  | Notes |
| ------------------------------------- | ------ | --- | ----- |
| 0. ADR acceptance                     |        |     |       |
| 1. Schema                             |        |     |       |
| 2. Backfill                           |        |     |       |
| 3. `organization_id` on domain tables |        |     |       |
| 4. Auth + request scoping             |        |     |       |
| 5. Repositories filter by org         |        |     |       |
| 6. Invites + role management          |        |     |       |
| 7. Cleanup (drop `users.role`)        |        |     |       |

## Performance budgets

| Metric                                   | Budget                      | Baseline (single-tenant) | Post-multi-tenant | Notes |
| ---------------------------------------- | --------------------------- | ------------------------ | ----------------- | ----- |
| Median list-metrics endpoint latency     | ≤ +5%                       |                          |                   |       |
| Median list-metric-logs endpoint latency | ≤ +5%                       |                          |                   |       |
| Login latency                            | ≤ +20ms (membership lookup) |                          |                   |       |

If post-rollout numbers exceed the budget, log an incident in `incidents.md` with the query plan and a mitigation (typically: index on `(organization_id, ...)` covering the access pattern).
