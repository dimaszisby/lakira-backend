# ADR-0005 — Topic exchange `lakira.jobs` with parking-lot DLX

- **Status:** Accepted
- **Date:** 2026-04-20
- **Origin:** `ADR-002` in the RabbitMQ kit — [`rabbitmq`](../../internal/initiatives/rabbitmq/decisions.md)

---

## Context

Need flexible per-job-type routing without a separate exchange per
feature. Also need a safe destination for poison messages.

## Decision

Single topic exchange `lakira.jobs` with dotted routing keys
(`metric-log.generate-dummy`, future `email.send`, etc.). A failed message is
retried with backoff (see [Retry](#retry)); once it fails terminally or exhausts
`RABBITMQ_MAX_RETRIES`, `nack(false, false)` routes it to the `lakira.jobs.parking`
exchange → `lakira.jobs.parking.queue` (no consumer, monitored for depth > 0).

## Options considered

- Direct exchange per feature — simpler but doesn't scale to many event types.
- Fanout — wrong semantics for point-to-point job queues.
- Full tiered retry (TTL queues) — deferred; adds significant topology complexity
  for PR 1 scaffolding. **Implemented 2026-09-15** as a single TTL retry queue per
  work queue — see [Retry](#retry).

## Consequences

Poison messages park after `RABBITMQ_MAX_RETRIES` retries, or at once when the
failure is terminal. Alert must be configured on parking lot queue depth — still
unbuilt.

## Retry

Added 2026-09-15, completing the deferred half of this decision.

- **Republish, never requeue.** Headers are immutable across a redelivery, so
  `nack(requeue=true)` cannot count and would loop forever. On a retryable failure the
  consumer publishes the message to `<queue>.retry` with `x-retry-count` incremented,
  waits for the broker confirm, then acks the original. A crash between the two
  duplicates the message, which [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md)'s
  guard absorbs; ack-then-publish would lose it. A failed republish parks the message.
- **Backoff lives in the broker.** Each retry carries a per-message `expiration` of
  `RABBITMQ_RETRY_BASE_DELAY_MS × 2^retryCount` (default 2 s → 2, 4, 8, 16, 32 s), capped at
  5 minutes. A pending retry survives a worker restart. `RABBITMQ_MAX_RETRIES=0` parks on
  the first failure.
- **Straight back to the failing queue.** `<queue>.retry` has no consumer and dead-letters
  through the default exchange to `<queue>` alone, not through `lakira.jobs`, so other
  queues bound to the same routing key never see the retry.
- **No `x-message-ttl`.** A queue argument cannot change without redeclaring the queue, so
  a queue-level delay would fail with `PRECONDITION_FAILED` on every deployed broker the
  first time it was tuned.
- **Terminal failures skip the loop.** Errors extending `TerminalMessageError` — malformed
  JSON, an unusable `messageId`, a 401/403/404 ownership rejection — park at retry count 0.
  Every other error is retried: wrongly retrying costs a delay, wrongly parking costs the work.

Trade-off accepted: per-message TTL only expires at the head of a queue, so a message with
a long delay holds back shorter ones queued behind it. A delay can stretch towards the
head's (at most the 5-minute cap); it never shortens, and nothing is lost. One queue per
delay tier would remove this at the cost of more topology; revisit if retry volume makes it
matter.

Rejected: an immediate republish (burns every retry in milliseconds against the same
broken dependency), an in-process `setTimeout` (lost on shutdown, holds drain open), and
the delayed-message-exchange plugin (not bundled in `rabbitmq:3.13-management-alpine`;
needs a custom image, against [ADR-0042](./adr-0042-vps-compose-deployment-topology.md)).

---
