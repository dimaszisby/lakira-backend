# Todo — list cache keys ignore the name filter

- **Status:** Fixed in kit [`list-cache-key-filters`](../initiatives/list-cache-key-filters/README.md)
  merged in #126. **Confirmed by the dated run of 2026-10-03** (R2 closed-confirmed)
- **Created:** 2026-09-29
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-09-29.md` §6 R2

---

## What

`metric/…/http/router.ts:42-43` and `metric-category/…/http/router.ts:40` build the cache key from
`req.query["filter[name]"]`. Express 4's default `qs` parser nests `?filter[name]=run` as
`req.query.filter.name` (checked on 2026-09-29 with the installed Express), so that key segment is
always empty. Two different name filters share one cache entry for 60 s (metrics) or 300 s
(categories). Scoped to one user and org, so no cross-tenant leak. No test catches it, because
Redis is off in tests.

## Suggested fix

Build the keys from `req.validated`, as `metric-log` and `metric-settings` handle both forms, and
add a unit test on the key function.

## Resolution (2026-10-01)

Wider than reported. On `GET /metrics` the category filter (`filter[categoryId]`) was broken the
same way as the name filter. `GET /metric-categories` was cached twice — the router layer with the
broken key, and `ListCategories` with a correct one — and fixing the router key would have made the
two keys identical, so the router layer was removed (kit D-02). Review then found
`GET /metric-settings` leaving `filter[isActive]` and `q` out of its key, and its list cache never
invalidated on writes (D-04, D-05). Metric and settings keys are now built from the validated query,
and both cache versions went to 3.
