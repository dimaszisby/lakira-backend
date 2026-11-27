# ADR-0100 — The worker runs no more jobs at once than its pool holds

- **Status:** Accepted
- **Date:** 2026-11-26
- **Related:** issue #310 (finding X62 of the dated run of 2026-11-14, written out as Y60; #299);
  amends [ADR-0077](./adr-0077-a-queued-job-holds-one-connection.md) (one
  connection per job, a bounded send); keeps [ADR-0067](./adr-0067-the-verification-email-is-a-queued-job.md)
  (the email is sent inside the job's transaction) and
  [ADR-0086](./adr-0086-the-database-pool-is-a-setting.md) (the pool is a setting)
- **Origin:** the owner chose to gate jobs to the pool on 2026-11-26, in the plan for #310; the
  prefetch cap and the per-channel abort came from that plan's review

---

## Context

Each queued email job sends inside its `runOnce` transaction, on purpose: sent after the commit, a
failed send would leave the dedup row committed and its retry would be skipped (ADR-0067). So a job
holds one connection for its send, bounded at 10 s (ADR-0077). Nothing bounded how many jobs ran
at once. Each of the worker's six consumers dispatched up to `RABBITMQ_PREFETCH` (10) jobs straight
to its handler, so 60 jobs could run on a pool of 5. With a slow provider, jobs waited on the pool,
and those still waiting at its 60 s acquire timeout failed into retry. The dated run reproduced it
with one connection and a 9 s sender: three of twelve jobs into retry at 61 s. ADR-0077's "with a
send bounded at 10 s the wait is bounded" held only by arithmetic nothing enforced.

## Decision

1. **One set of job slots per worker, sized from `DB_POOL_MAX`** (`JobSlots`,
   `src/shared/infrastructure/queue/JobSlots.ts`). Every consumer the worker builds takes the same
   instance; `ConsumerOptions.slots` is required, so a new consumer cannot be built without one.
2. **A delivered message runs only when a slot is free.** It waits for one holding no connection,
   in arrival order, and frees it as soon as its handler settles, before the ack or the retry.
   A job uses one connection (ADR-0077), so jobs never ask the pool for more than it holds, and no
   job can wait on the acquire timeout, whatever the pool, the prefetch or the provider's speed.
3. **Each consumer prefetches no more than the slots can run:** `min(RABBITMQ_PREFETCH,
DB_POOL_MAX)`. A message held past that would only wait, unacked, where another worker could not
   take it.
4. **A message still waiting is never started once it cannot be settled.** At shutdown it is
   returned to the queue as it came (`nack` with requeue, no retry counted), and the drain does not
   wait on it. When its channel closes under it, the broker has already requeued it, so it is
   dropped without running.
5. Delivery is unchanged: the email is still sent inside the transaction, at least once, and never
   lost.

## Options considered

- **Send after the commit, with a claim.** The job commits its writes and claims the message, sends
  holding no connection, then marks it done; a failed send releases the claim, and a stale claim is
  taken over. It removes the connection hold, which is the long-term shape, and would need no gate.
  But it changes ADR-0007, 0067, 0069, 0070 and 0077, adds a migration and claim states, and
  restructures all five email jobs and their fallbacks. The worker is not deployed yet (ADR-0040),
  so the throughput it would buy is not needed.
- **Refuse at startup a pool smaller than the jobs the consumers can run.** Six consumers at a
  prefetch of 10 need 60 connections per worker: the defaults would refuse, and a pool that size
  strains small Postgres plans, while a prefetch of 1 would slow every queue.
- **A larger default pool.** Moves the threshold and fixes nothing (ADR-0077's own rejection).

## Consequences

- The worker sends at most `DB_POOL_MAX` emails at once: its throughput is the pool size per send
  time. A worker that needs more raises `DB_POOL_MAX`, within the database's connection limit.
- A connection is still held for each send, and the job's row locks with it.
- Prefetched messages wait unacked. At the defaults, six consumers each hold at most 5 for 5 slots:
  the longest wait is 30 / 5 × 10 s = 60 s, and with a pool of 1 it is 6 × 10 s = 60 s too, both far
  under RabbitMQ's 30-minute delivery timeout.
- `RABBITMQ_PREFETCH` above `DB_POOL_MAX` has no effect on the worker.
- Out of scope: the API process's fallbacks, which run a job in process only when a publish fails,
  one per request; a request already holds at most one connection.

## Links

- `src/shared/infrastructure/queue/JobSlots.ts`, `RabbitMQConsumer.ts`; `src/worker.ts`
- `__tests__/unit/shared/infrastructure/queue/JobSlots.test.ts`, `RabbitMQConsumer.test.ts`
- `__tests__/integration/features/auth/email-jobs-within-the-pool.integration.test.ts`,
  `__tests__/integration/queue/job-slots.integration.test.ts`
- `__tests__/unit/architecture.test.ts` › "src/worker.ts gives every consumer the one set of job
  slots"
