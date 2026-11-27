# ADR-0102 — A channel the broker closes is reopened

- **Status:** Accepted
- **Date:** 2026-11-28
- **Related:**
  - issue #312 (finding Y61 of the dated run of 2026-11-14; #299);
  - amends decision 1 of
    [ADR-0080](./adr-0080-the-queue-fails-over-to-the-process.md) (a broken queue fails over to the
    process);
  - keeps [ADR-0004](./adr-0004-use-amqp-connection-manager.md) (`amqp-connection-manager`) and
    [ADR-0100](./adr-0100-the-worker-runs-no-more-jobs-than-its-pool-holds.md) (the worker's job
    slots).
- **Origin:** the owner chose, on 2026-11-28:
  - in the plan for #312: reopening the channel with backoff, in both processes, with neither
    exiting;
  - after its review: a stability window for the backoff, and closing the channel when the broker
    cancels its consumer, both in this change.

---

## Context

`amqp-connection-manager` 5.0.0 runs a channel's `setup` again only when the whole connection
reconnects (`ChannelWrapper._onConnect`). When the broker closes one channel, the library clears it
and waits for a reconnect (`_onChannelClose`). `absorbChannelErrors` keeps the connection up through
such a close (ADR-0080, X63), so no reconnect came. That close comes from a declaration refused with
a 406, or at runtime, for example a 404 from a publish to an exchange that does not exist.

- The worker stayed alive and consumed nothing.
- The API's publisher stayed available after a runtime close, so each publish waited out its 3 s
  timeout before its caller fell back. Neither process declared the queue again.

ADR-0080 decision 1 said the consumer consumes nothing "until the library's next setup succeeds",
and no such next setup ever came.

The review found a second path to the same state. RabbitMQ cancels the consumer of a queue that is
deleted and leaves the channel open (amqplib turns on `consumer_cancel_notify`). The consume callback
gets `null`, and nothing closes.

## Decision

1. **A channel the broker closes is opened again** (`ReopeningChannel`,
   `src/shared/infrastructure/queue/ReopeningChannel.ts`). It owns the channel's wrapper.
   - **When the reopen acts.** After a close it did not cause, it waits, then opens a new wrapper.
     Before that, it checks that the connection is up and that no setup has run since. On a
     connection loss, the library's own reconnect sets the current wrapper up, and the reopen does
     nothing.
   - **The old wrapper** is closed first. A late setup of a replaced wrapper closes its channel
     rather than consuming on it.
   - **Who uses it:** `RabbitMQPublisher` and `RabbitMQConsumer` both build their channel through
     it.
2. **The wait** starts at 1 s and doubles to 30 s. It starts over only after a channel has stayed up
   30 s, so a close that recurs on every setup keeps backing off rather than looping once a second.
3. **The publisher reports itself disabled from the moment its channel closes**, whether the broker
   closed it or the connection dropped, until it connects again. Its callers take the queue-off
   path at once.
4. **A consumer the broker cancels closes its channel**, so the reopen declares the queue again and
   consumes.
5. **Neither process exits** over a channel that cannot be set up. A cause that persists is retried
   on the backoff, and each attempt is logged. Once the consumer starts stopping, it opens nothing
   again.

## Options considered

- **A forced `connection.reconnect()`.** Rejected: it closes every healthy channel with the broken
  one, and their in-flight acks.
- **Calling the library's private `_onConnect` on the existing wrapper.** Rejected: it is not a
  public API and can change in any release.
- **The worker exits after a stretch without consuming.** Rejected by the owner: a declaration
  mismatch survives a restart, so the worker would crash-loop, as ADR-0080 found for the API.
- **Resetting the wait on every connect.** Rejected after review: a retry queue declared on the
  broker with other arguments closes the consumer's channel each time a job fails. The message is
  redelivered with its retry count unchanged, so the handler would run once a second without end.
- **Declaring retry queues on a channel of their own,** so such a 406 never closes the consumer.
  Not taken: the owner chose the stability window alone. A message caught this way runs again once
  every 30 s until the queue is fixed.
- **Filing the broker cancel as its own issue.** Rejected by the owner: it is the same symptom, and
  the fix is a close the reopen already handles.

## Consequences

- A broker problem limited to one channel heals once its cause is removed, within the backoff. By
  hand, a worker whose verification queue was mismatched consumed again about 16 s after the queue
  was deleted.
- **One mismatched queue fails every channel,** because each declares the whole topology. All of
  them retry, each logging a line per attempt.
- **On every connection drop the API sends in process** until the publisher connects again. Before,
  a publish waited on the wrapper's buffer and usually got through within its 3 s.
- **While the shared retry publisher is reopening,** a consumer's failed job is parked instead of
  retried: its publish is refused. That was also true before, when it stayed refused.
- **A cancel or a reopen loses in-flight acks** on the closed channel. The broker redelivers those
  jobs, and the dedup absorbs any that committed (ADR-0007).

## Enforcement

- `__tests__/unit/shared/infrastructure/queue/ReopeningChannel.test.ts`:
  - the wait, the cap and the stability window;
  - no reopen while disconnected, after the library's own setup, or after `close()` or
    `stopReopening()`;
  - a replaced wrapper's late setup;
  - the old wrapper is closed first.
- `RabbitMQPublisher.test.ts` and `RabbitMQConsumer.test.ts`: the publisher is disabled from a close;
  the consumer forgets its tag on a close, and closes its channel on a broker cancel.
- `__tests__/integration/queue/failure-paths.integration.test.ts`, against a broker:
  - the consumer and the publisher come back after a mismatched queue is deleted;
  - the publisher is disabled after a runtime close, then comes back;
  - a consumer whose queue is deleted consumes again;
  - a reconnect of the whole connection leaves one consumer.
  - The suite sets `RABBITMQ_ENABLED`, without which `isEnabled()` is false whatever the channel
    does.
- Mutation checks: with the reopen turned off, the reopen tests fail. Without the close on a broker
  cancel, the cancel test fails.

## Links

- `src/shared/infrastructure/queue/ReopeningChannel.ts`, `RabbitMQPublisher.ts`,
  `RabbitMQConsumer.ts`
- Audit: `docs/internal/audits/saas-readiness/audit-2026-11-14.md` § 6 (Y61)
