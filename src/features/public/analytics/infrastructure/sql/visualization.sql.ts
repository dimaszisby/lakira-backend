import { BucketSpec } from "../../domain/buckets.js";

// Query for logs in a singular metric
// used for data visualizations in Metric Details Page

export function buildVisualizationSQL(spec: BucketSpec) {
  // Uses :interval, :tz, :start, :end, :metricId
  // Aligns to bucket boundaries in the user's TZ.
  return `
    WITH bounds AS (
      SELECT
        timezone(:tz, :start::timestamptz) AS start_tz,
        timezone(:tz, :end::timestamptz)   AS end_tz
    ),
    series AS (
      SELECT generate_series(
        date_trunc('${spec.trunc}', (SELECT start_tz FROM bounds)),
        (SELECT end_tz FROM bounds) - interval '1 second',
        interval '${spec.interval}'
      ) AS bucket_start
    ),
    logs AS (
      SELECT
        timezone(:tz, ml.logged_at) AS ts_tz,
        ml.log_value
      FROM metric_logs ml
      WHERE ml.metric_id = :metricId
        AND ml.logged_at >= :start::timestamptz
        AND ml.logged_at <  :end::timestamptz
    ),
    binned AS (
      SELECT
        date_trunc('${spec.trunc}', ts_tz) AS bucket_start,
        avg(log_value) AS avg_value,
        min(log_value) AS min_value,
        max(log_value) AS max_value,
        count(*)::int       AS cnt
      FROM logs
      GROUP BY 1
    )
    -- A label is the bucket's wall time in :tz, sent with a Z (ADR-0062). As a
    -- timestamptz read in UTC, the driver reads it the same in every process zone
    -- (analytics-leftovers D-03).
    SELECT
      timezone('UTC', s.bucket_start) AS bucket_start,
      b.avg_value, b.min_value, b.max_value, b.cnt
    FROM series s
    LEFT JOIN binned b
      ON b.bucket_start = s.bucket_start
    ORDER BY s.bucket_start ASC;
  `;
}
