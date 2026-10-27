# Todo — the database pool is Sequelize's default, and no variable tunes it

- **Status:** Open. Register row B-94
- **Created:** 2026-10-27
- **Owner:** unassigned
- **Origin:** N8 (P2) of `docs/internal/audits/saas-readiness/audit-2026-06-05.md` § 6.3, re-read
  on 2026-10-27 ([`audit-0605-reread`](../initiatives/audit-0605-reread/README.md))

---

## What

`src/config/db.ts` builds the Sequelize instance with no `pool` option, so every process gets the
default: at most 5 connections, idle after 10 s, acquire timeout 60 s. `zodEnv.ts` declares no
`DB_POOL_*`. The server, the worker and every instance behind a load balancer each hold their own
pool, and a managed Postgres has a connection limit the sum must stay under.

## Why it matters

X62 (B-75) showed what a pool of 5 does under concurrent work: five email jobs stalled to the 60 s
acquire timeout. B-75 fixed that path by holding one connection per job; the size itself is
still not a setting, so the only answer to "more instances" or "more concurrency" is a code change.

## Suggested fix

`DB_POOL_MAX` and `DB_POOL_MIN` (and perhaps the acquire timeout) in `zodEnv.ts`, defaults equal to
today's, passed in `db.ts` and the migration config; documented in `configuration.md` with the
sum-under-the-server-limit rule. Effort ≤1h, per the run.
