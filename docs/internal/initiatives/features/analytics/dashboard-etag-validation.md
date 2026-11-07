# Dashboard ETag & Cache-Control Validation

## Goal

Ensure the `/analytics/dashboard` endpoint invalidates cached payloads whenever metric metadata changes and that HTTP caching headers match frontend expectations.

## Manual Verification Steps

1. **Baseline fetch**

   ```bash
   curl -H "Authorization: Bearer <token>" \
        'http://localhost:8001/api/v1/analytics/dashboard?bucket=1d&last=30d&v=2' -i
   ```

   - Confirm response headers include `ETag: "<seed>"` and `Cache-Control: private, max-age=60, stale-while-revalidate=30` (assuming default env vars).
   - Store the returned `ETag` (E1) and `sync.etagSeed`.

2. **304 behavior**

   ```bash
   curl -H "Authorization: Bearer <token>" \
        -H "If-None-Match: "<E1>"" \
        'http://localhost:8001/api/v1/analytics/dashboard?bucket=1d&last=30d&v=2' -i
   ```

   - Expect `HTTP/1.1 304 Not Modified` and no body.

3. **Metadata change invalidation**
   - Update a metric name or category (via API or DB) so that `metrics.updated_at` or `metric_categories.updated_at` changes.
   - Repeat step 1; expect:
     - Redis miss due to new `vizDashKey` version cursor.
     - New `ETag` value (E2 ≠ E1).
     - Payload reflecting updated metadata.

4. **Fallback logging check** (optional but easy while endpoint exercised)
   - Select a metric with stale logs, trigger fallback view, and tail backend logs for `analytics.dashboard.fallback_range_used` to confirm metadata is present.

## Status

- CLI validation steps documented for QA/FE to execute in staging once the API is redeployed with the caching changes (commit TBD).
- Automated integration tests for `If-None-Match` remain TODO per backend testing checklist.
