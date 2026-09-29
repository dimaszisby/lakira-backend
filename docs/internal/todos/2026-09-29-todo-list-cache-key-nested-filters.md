# Todo — list cache keys ignore the name filter

- **Status:** Open (R2, P2 — serves wrong results)
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
