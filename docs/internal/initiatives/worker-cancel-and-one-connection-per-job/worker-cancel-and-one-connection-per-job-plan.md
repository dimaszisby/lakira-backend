# Worker cancel and one connection per job — Plan

- **Status:** Done
- **Appetite:** 2 days
- **Date:** 2026-10-21

## Context and goals

Two P1 findings of the dated run of 2026-10-20 (`audit-2026-10-20.md` § 6), both reproduced there
on a throwaway broker and database. Checked on `dev` at `b3054cb`:

- **B-74 / X60.** `RabbitMQConsumer` registers its consumer with the raw channel's `consume` inside
  the wrapper's `setup`, so `amqp-connection-manager` does not track it and
  `ChannelWrapper.cancel(tag)` returns without cancelling. On SIGTERM the worker logs "Consumer
  cancelled", keeps receiving through the drain, and closes the channel under handlers still
  running.
- **B-75 / X62.** Inside `runOnce`'s transaction, the three email paths read a user or an
  organization through the pool, on a second connection. With Sequelize's default pool of five,
  five concurrent jobs each hold one connection and wait for another until the 60 s acquire
  timeout. The send runs inside the transaction, by design (ADR-0067), and no sender has a
  timeout, so a hung provider holds its connection indefinitely.

When this lands, a stopping worker takes no new message, and an email job holds one connection
for a bounded time.

## Acceptance criteria

- **AC-1** — After `cancel()`, the broker reports no consumer on the queue while the channel is
  still open.
  _Why:_ X60.
- **AC-2** — A reconnect after `cancel()` does not start consuming again.
  _Why:_ the fix must hold across `amqp-connection-manager`'s re-setup.
- **AC-3** — 8 concurrent jobs of each email kind, more than the pool holds, complete within
  15 s, each sending once.
  _Why:_ X62.
- **AC-4** — Every repository call inside a `runOnce` work function in the three paths uses `tx`.
  _Why:_ the root cause, held by a unit test per use case.
- **AC-5** — A send that does not settle is abandoned after `EMAIL_SEND_TIMEOUT_MS`, and the job
  fails into retry.
  _Why:_ the send runs inside the transaction.
- **AC-6** — The existing queue integration tests pass unchanged.
  _Why:_ dedup, retry tiers and parking must behave as before.

## Open questions

None.

## Out of scope

A configurable connection pool (N8 of the 2026-06-05 run; kit D-04). The other findings of the
2026-10-20 run, B-76 to B-84.

## Decisions expected

D-01 how the consumer is cancelled; D-02 one connection per `runOnce` job; D-03 a bounded send;
D-04 the pool size.

## Phases

### Phase 0 — kit and branch

### Phase 1 — tests first, each seen to fail

### Phase 2 — the consumer, the repositories and use cases, the bounded sender

### Phase 3 — gates, review, docs

## Risks and trade-offs

A send that completes after the timeout is sent again on retry: at least once, as a crash already
is. Under a hung provider, jobs beyond the pool's five wait their turn, each for at most the send
bound.

## Rollback

Code: revert the PR. No migration, no configuration.

## References

- ADR-0077; ADR-0067; ADR-0073; ADR-0076
