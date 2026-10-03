# Todo — the response cache stores error bodies and replays them as 200

- **Status:** Fixed in #133 (`50258e4`; Micro; kit
  `saas-reaudit-2026-10-03` D-07). S1 stays open in the audit until a dated run confirms it
  (ADR-002). The S12 items named under "Suggested fix" are not part of that change and stay open
- **Created:** 2026-10-03
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 6, S1; kit `saas-reaudit-2026-10-03` D-05

---

## What

`cacheMiddleware` (`src/shared/middleware/cache.ts:43-55`) wraps `res.json` and stores whatever is
passed to it. `sendError` writes error bodies through the same `res.json`, so a 404, a 403 or a
masked 500 on a cached route is stored and then replayed with status `200` until the key expires.

Reproduced on 2026-10-03 against `src/server.ts`: `GET /api/v1/metrics/<unknown id>` answered `404`,
then `200 {"status":"fail","message":"Metric not found"}` twice, with 59 s left on the key. Eight
routes use the middleware, with TTLs of 60 to 600 s. Keys are scoped to one user and organization,
so nothing leaks; the defect is a wrong status and a failure that outlives its cause.

It was not caught because the middleware is skipped under `NODE_ENV=test` and its unit test has no
error case. Blocks the GOLD restatement.

## Suggested fix

Store only when `res.statusCode` is 2xx. Add a unit test that sends an error through a cached
route and asserts nothing is written. The same audit's S12 (P3) is in the same file: free-text key
segments are not encoded, and the hit, miss and write lines log the full key.
