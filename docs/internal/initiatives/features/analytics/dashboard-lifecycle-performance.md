# Dashboard Lifecycle Query Performance Snapshot

## Context

- Date: 2024-02-10
- Environment: Local Postgres 17-alpine container (`docker run --rm --name analytics-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lakira_dev -p 55432:5432 postgres:17-alpine`).
- Dataset: 3 metrics × 721 hourly logs each (2,163 rows) inserted via `generate_series` (see `docker exec analytics-db psql ... INSERT ...`).
- Indexes: composite `ix_metric_logs_metric_id_logged_at` present.

## Query

```
EXPLAIN ANALYZE
WITH covered_metrics AS (
  SELECT * FROM (VALUES
    ('11111111-1111-1111-1111-111111111111'::uuid),
    ('22222222-2222-2222-2222-222222222222'::uuid),
    ('33333333-3333-3333-3333-333333333333'::uuid)
  ) AS t(metric_id)
),
logs AS (
  SELECT ml.metric_id,
         timezone('Asia/Jakarta', ml.logged_at) AS ts_tz,
         ml.log_value
  FROM metric_logs ml
  JOIN covered_metrics cm ON cm.metric_id = ml.metric_id
),
ranked AS (
  SELECT l.metric_id,
         l.ts_tz,
         l.log_value,
         row_number() OVER (PARTITION BY l.metric_id ORDER BY l.ts_tz DESC) AS rn
  FROM logs l
),
aggregates AS (
  SELECT metric_id,
         MIN(ts_tz) AS first_log_at,
         MAX(ts_tz) AS last_log_at,
         COUNT(*)::bigint AS total_logs,
         MAX(log_value) FILTER (WHERE rn = 1) AS latest_value,
         MAX(date_trunc('day', ts_tz)) FILTER (WHERE rn = 1) AS latest_bucket_start
  FROM ranked
  GROUP BY metric_id
)
SELECT cm.metric_id,
       ag.first_log_at,
       ag.last_log_at,
       COALESCE(ag.total_logs, 0)::bigint AS total_logs,
       ag.latest_value,
       ag.latest_bucket_start
FROM covered_metrics cm
LEFT JOIN aggregates ag ON ag.metric_id = cm.metric_id
ORDER BY cm.metric_id;
```

## Result Summary

```
Merge Left Join  (cost=55.14..57.41 rows=3 width=56) (actual time=4.562..5.324 rows=3 loops=1)
  Merge Cond: (cm.metric_id = ml.metric_id)
  ...
Planning Time: 2.537 ms
Execution Time: 5.962 ms
```

Interpretation:

- With ~2k rows, the lifecycle aggregation completes in ~6 ms, dominated by the sort + window aggregate. The planner leveraged the composite index for the hash join on `(metric_id, logged_at)`.
- Expect roughly linear scaling with metrics included in `covered_metrics`; add monitoring once real datasets (~10^4 logs/metric) are available.

## Next Steps

- Re-run this EXPLAIN periodically on staging data to ensure row estimates/p95 latency remain within the <300 ms SLA.
- Once fallback logic queries additional windows, capture a companion EXPLAIN for the bucketed series query to compare resource usage.
