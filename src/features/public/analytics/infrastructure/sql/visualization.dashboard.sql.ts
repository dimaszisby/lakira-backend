import type { BucketSpec } from "../../domain/buckets.js";

// Query for logs in a multiple metrics
// used for data visualizations in Dasboard Page

// SQL for computing binned metric logs for multiple metrics
export function buildDashboardSQL(spec: BucketSpec) {
  return `
    WITH bounds AS (
      SELECT timezone(:tz, :start::timestamptz) AS start_tz,
             timezone(:tz, :end::timestamptz)   AS end_tz
    ),
    series AS (
      SELECT generate_series(
        date_trunc('${spec.trunc}', (SELECT start_tz FROM bounds)),
        (SELECT end_tz FROM bounds) - interval '1 second',
        interval '${spec.interval}'
      ) AS bucket_start
    ),
    covered_metrics AS (
      SELECT unnest(:metricIds::uuid[]) AS metric_id
    ),
    logs AS (
      SELECT ml.metric_id,
             timezone(:tz, ml.logged_at) AS ts_tz,
             ml.log_value
      FROM metric_logs ml
      JOIN covered_metrics cm ON cm.metric_id = ml.metric_id
      WHERE ml.logged_at >= :start::timestamptz
        AND ml.logged_at <  :end::timestamptz
    ),
    binned AS (
      SELECT l.metric_id,
             date_trunc('${spec.trunc}', l.ts_tz) AS bucket_start,
             avg(l.log_value) AS avg_value,
             min(l.log_value) AS min_value,
             max(l.log_value) AS max_value,
             count(*)::int         AS cnt
      FROM logs l
      GROUP BY 1,2
    )
    SELECT cm.metric_id,
           s.bucket_start,
           b.avg_value, b.min_value, b.max_value, b.cnt
    FROM covered_metrics cm
    CROSS JOIN series s
    LEFT JOIN binned b
      ON b.metric_id = cm.metric_id AND b.bucket_start = s.bucket_start
    ORDER BY cm.metric_id, s.bucket_start;
  `;
}

// SQL for computing lifecycle metrics for multiple metrics
export function buildDashboardLifecycleSQL(spec: BucketSpec) {
  return `
    WITH covered_metrics AS (
      SELECT unnest(:metricIds::uuid[]) AS metric_id
    ),
    logs AS (
      SELECT ml.id,
             ml.metric_id,
             ml.logged_at,
             timezone(:tz, ml.logged_at) AS ts_tz,
             ml.log_value
      FROM metric_logs ml
      JOIN covered_metrics cm ON cm.metric_id = ml.metric_id
    ),
    -- Ranked by the instant, not by ts_tz. Two instants share a local time
    -- when a zone leaves daylight saving time (ADR-0052).
    ranked AS (
      SELECT l.metric_id,
             l.ts_tz,
             l.log_value,
             row_number() OVER (
               PARTITION BY l.metric_id
               ORDER BY l.logged_at DESC, l.id DESC
             ) AS rn
      FROM logs l
    ),
    aggregates AS (
      SELECT metric_id,
             MIN(ts_tz) AS first_log_at,
             MAX(ts_tz) AS last_log_at,
             COUNT(*)::bigint AS total_logs,
             MAX(log_value) FILTER (WHERE rn = 1) AS latest_value,
             MAX(date_trunc('${spec.trunc}', ts_tz)) FILTER (WHERE rn = 1) AS latest_bucket_start
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
  `;
}
