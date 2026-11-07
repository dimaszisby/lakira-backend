# Metric Logs Index Audit

Date: 2024-02-10

## Objective

Verify whether `metric_logs` already exposes a covering index suitable for the dashboard lifecycle query and identify any remaining gaps.

## Findings

- Migration `20250109160356-create-metric_logs.cjs` creates both a unique constraint and a composite b-tree index on `(metric_id, logged_at)` (`ix_metric_logs_metric_id_logged_at`).
- The dashboard queries (bucket aggregation + lifecycle metadata) filter and order by `metric_id` and `logged_at` (or `date_trunc(.., logged_at)`), so the existing index already covers the access pattern and avoids sequential scans for targeted metric sets.
- Because `bucket_start` is derived from `logged_at` and additionally depends on timezone/bucket granularity, adding a dedicated `bucket_start` column would not reduce query cost without duplicating per-timezone values.

## Actions

- Retain existing composite index; re-evaluate once fallback adoption increases or if EXPLAIN shows bloat.
- Document reasoning in `analytics-backend-overhaul-plan.md` (Phase 1 section).
