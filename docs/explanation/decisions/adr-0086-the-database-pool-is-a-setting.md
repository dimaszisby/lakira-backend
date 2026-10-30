# ADR-0086 — The database pool is a setting, sized per process

- **Status:** Accepted
- **Date:** 2026-10-29
- **Related:** issue #239 (finding N8 of the 2026-06-05 run, register row B-94); B-75 / X62, the
  stall of concurrent email jobs on the pool; `RABBITMQ_PREFETCH`, the worker's concurrency
- **Origin:** issue #239, planned and approved on 2026-10-29

---

## Context

`src/config/db.ts` built the Sequelize instance with no `pool` option, so every process got
Sequelize's default: at most 5 connections, closed after 10 s idle, a 60 s wait to acquire one. No
variable changed it. Each process holds its own pool (the server, the worker, every instance
behind a load balancer), and a managed Postgres has one connection limit for all of them, so the
right size depends on the deployment, which the code cannot know. The worker's concurrency was
already a setting (`RABBITMQ_PREFETCH`), and a job holds one connection for its whole run since
B-75, so raising that alone could only make jobs wait on a pool of 5.

## Decision

- **`DB_POOL_MAX`** (default `5`) and **`DB_POOL_MIN`** (default `0`) size the pool. The defaults
  are Sequelize's own, so a deployment that sets neither keeps today's pool.
- Each must be a whole number, `DB_POOL_MAX` 1 or more; `DB_POOL_MIN` above `DB_POOL_MAX` is
  refused at startup, naming both. The message never quotes anything but the two numbers.
- `poolOptions(max, min)` in `db.ts` builds the option, with `idle` and `acquire` written out at
  Sequelize's defaults, so the whole pool reads in one place.
- The migration config (`config.cjs`) does not read them: the CLI opens one connection for a short
  run.
- `docs/reference/configuration.md` states the two sizing rules: the pools together stay under the
  database's limit, and a worker's pool covers the jobs it runs at once.

## Options considered

- **Settings for `idle` and `acquire` too:** nothing has needed them; one can be added when a
  deployment does.
- **A startup check of `DB_POOL_MAX` against `RABBITMQ_PREFETCH`:** the jobs a worker runs at once
  are the prefetch times the queues it consumes, which the worker knows and the env schema does
  not. The rule is written down instead.
- **A higher default:** the right size is a deployment's, and a higher default could exceed a small
  database's limit across several instances.

## Consequences

- The configuration has two more variables (74 in the schema).
- A deployment sizes its pools explicitly; the docs say how.
