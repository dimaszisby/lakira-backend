# ADR-0080 — A broken queue fails over to the process, and a fallback runs its job once

- **Status:** Accepted
- **Date:** 2026-10-21
- **Related:** [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md) (dedup);
  [ADR-0054](./adr-0054-post-response-work-is-tracked-and-drained.md) (work after the response);
  [ADR-0067](./adr-0067-the-verification-email-is-a-queued-job.md),
  [ADR-0069](./adr-0069-the-password-reset-email-is-a-queued-job.md),
  [ADR-0070](./adr-0070-the-invite-email-is-a-queued-job.md) (the queued emails);
  [ADR-0073](./adr-0073-dedup-per-queue-and-retry-tiers.md) (dedup per queue);
  [ADR-0076](./adr-0076-promises-are-awaited-and-shutdown-has-a-deadline.md) (shutdown)
- **Origin:** `D-01` to `D-04` in the queue-failure-paths kit —
  [`queue-failure-paths`](../../internal/initiatives/queue-failure-paths/decisions.md); register
  rows B-78 (finding X63 of the dated run of 2026-10-20) and B-84 (X64 to X68, N4), bundled by
  register D-10

---

## Context

Every queued job has an in-process path for a queue that is off. The dated run of 2026-10-20
found the paths between the two wrong:

- **X63.** No channel had an `error` listener. A channel whose `setup` failed, for example a work
  queue declared on the broker with another dead-letter exchange, emitted `error` to nobody, and
  the rejection stopped the API. Testing this change found a second emitter: the broker closes such
  a channel, amqplib emits `error` on the raw channel, `amqp-connection-manager` listens for its
  `close` but not its `error`, and the throw took the whole connection down.
- **X64.** Publishes are `mandatory` on a confirm channel. An unroutable message is returned and
  then confirmed, so the publish resolved and the fallback never ran.
- **X68.** A publish that timed out after it reached the broker was sent twice, by the fallback
  and by the worker, and the second token replaced the first, so the first email's link stopped
  working. It failed #199's Fork Smoke.
- **X65, X66, X67.** Two exits did not flush their logs; the worker left Redis open; and after a
  crash the worker drained for up to 20 s, which the server does not.
- **N4.** A job did not carry the id of the request that published it.

## Decision

1. **A channel that cannot be set up makes the queue unavailable, not the process fatal.** Every
   channel wrapper listens for `error` and logs it, and every `setup` first listens for `error` on
   its raw channel (`absorbChannelErrors`). The publisher reports itself disabled from an `error`
   until its channel connects again, so callers take the path they take with the queue off. The
   consumer logs and consumes nothing until the library's next setup succeeds.
2. **An unroutable publish rejects** with `UnroutableMessageError`. RabbitMQ sends the return
   before the confirm; the publisher records the returned message's id and fails that publish.
3. **A fallback after a failed publish is the job itself, recorded once.** The use case runs the
   job's `executeInTransaction` in process through `MessageIdempotencyPort.runOnce`, keyed by the
   `messageId` it tried to publish and the job's queue, the key the worker uses. Whichever of the
   fallback and the worker runs second finds the record and sends nothing. `QUEUES` is named in
   `src/shared/application/messaging/job-routes.ts`, beside the routing keys, so a use case can
   name the key. With the queue off nothing was published, and that path is unchanged.
4. **A crashed worker closes its consumers without draining**, as the server skips its drain;
   unacked jobs return to the queue and the dedup absorbs any that committed. The worker closes
   Redis on every shutdown, and both entry points flush their logs before `process.exit`.
5. **A job carries its request's id** in the `x-request-id` header, and the consumer handles it
   under that id when it matches the HTTP middleware's pattern, or a minted one.

## Options considered

- _Exit on a setup failure and let the platform restart the process._ A declaration mismatch
  survives a restart: the API would crash-loop over an optional dependency.
- _Leave the publisher enabled after an error._ Each publish would wait out its 3 s timeout before
  falling back.
- _An alternate exchange for unroutable messages._ Nothing consumes it, and every deployment's
  topology would change.
- _Do not fall back after a publish timeout._ A timeout cannot tell a lost publish from a slow
  confirm, so the email would sometimes never be sent.
- _A longer publish timeout._ It narrows the double-send window and holds every request longer.
- _Keep draining after a crash._ The process state is unknown, and the 25 s deadline would be spent
  waiting for work running in it.

## Consequences

- A broker problem degrades to in-process sending and shows in the logs; the API stays up.
- The API process writes `processed_messages` rows when it runs a job's fallback.
- A crash costs a redelivery rather than a 20 s stall.
- Queue log lines name the routing key `route`: a metadata key ending in `key` is masked as a
  secret, and every routing key was logged as `***REDACTED***`.
- The queue integration suites wait for a connection only when it is not already up
  (`__tests__/integration/helpers/broker.ts`): with `RABBITMQ_ENABLED=true` in the environment
  they all timed out locally. CI runs them with the flag off.

## Enforcement

- `__tests__/integration/queue/failure-paths.integration.test.ts`, against a broker: a queue
  declared with another dead-letter exchange leaves the process and the connection up and the
  publisher disabled; an unroutable publish rejects; a request id reaches the handler.
- `__tests__/integration/features/auth/fallback-sends-once.integration.test.ts`: each of the three
  emails is sent once when its publish times out after reaching the broker, whether the fallback
  or the worker runs first. On the code before this change, all six sent twice.
- Unit: `RabbitMQPublisher.test.ts`, `RabbitMQConsumer.test.ts`, the three use cases'
  tests, `__tests__/unit/worker/worker-shutdown.test.ts`; `architecture.test.ts` › an entry point
  flushes its logs before it exits.

## Links

- Kit: [`queue-failure-paths`](../../internal/initiatives/queue-failure-paths/README.md)
- Audit: `docs/internal/audits/saas-readiness/audit-2026-10-20.md` § 6 (X63 to X68)
- Todo: `docs/internal/todos/2026-10-20-todo-broker-setup-failure-stops-the-api.md`
