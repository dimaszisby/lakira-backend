# Todo — the readiness probe is unthrottled and hits the database on every call

- **Status:** Open (P2)
- **Created:** 2026-10-03
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 6, S9

---

## What

`GET /api/v1/ready` (`src/server.ts:168-194`) is unauthenticated, is mounted before the global
limiter (`:197`) and runs `sequelize.authenticate()` and a Redis ping on every call. With the
default pool of 5 (N8), a flood of probes competes with real requests for connections.

## Suggested fix

Cache the probe's result for a few seconds, so any number of calls costs one check per window.
Keep it ahead of the limiter: a platform probe must not be throttled.
