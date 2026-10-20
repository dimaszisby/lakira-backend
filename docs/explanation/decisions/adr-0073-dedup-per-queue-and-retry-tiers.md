# ADR-0073 — A message is deduplicated per queue, and a retry waits in the queue of its delay

- **Status:** Proposed
- **Date:** 2026-10-20
- **Related:** Amends [ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md) § Retry (the
  head-of-line trade-off it accepted) and [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md)
  (the dedup key)
- **Origin:** `D-01` to `D-03` in the queue-design-hardening kit —
  [`queue-design-hardening`](../../internal/initiatives/queue-design-hardening/decisions.md);
  register row B-40 (audit 2026-09-29, § 6 R8)

---

## Context

Three findings of the 2026-09-29 audit (R8), all still true on `dev` at `394f949`:

- `processed_messages` was keyed on `message_id` alone (ADR-0007). A message published to the
  jobs exchange reaches every queue bound to its routing key, with the same id. The second queue's
  copy found the id recorded and was acked as a duplicate: its work was lost without a sign.
- Each work queue had one retry queue, and each retry carried its backoff as a per-message
  expiration (ADR-0005). RabbitMQ expires only the message at the head of a queue, so a retry due
  in 200 ms waited behind one due in 1.6 s. Observed on the code before this change: the short
  retry came back second, after 1638 ms. ADR-0005 accepted this, and named one queue per delay as
  the fix "if retry volume makes it matter"; since #184 to #187, every email goes through the
  queue.
- The dummy-logs handler cast its payload and looped `count` times, writing a row each time.

## Decision

1. **The dedup key is `(message_id, queue)`** (migration
   `20261020000001-processed-messages-key-per-queue.cjs`). A message is processed once per queue
   it reaches. `processed_at` gets an index, the one a cleanup by age would need (B-41). `down`
   restores the old key, but refuses while a message id is recorded on two queues, naming them:
   which row to drop is not a migration's call.
2. **One retry queue per delay.** `retryQueueFor(queue, delayMs)` is `<queue>.retry.<delayMs>`,
   declared by `assertRetryTier` with `x-message-ttl: delayMs` and the same dead-letter route back
   to `<queue>` as before. Every message in a tier waits the same time, so the queue stays in
   order. The consumer declares the tier (idempotent) before it republishes, and no longer sets a
   per-message expiration; `expirationMs` is gone from `PublishOptions`. `retryDelaysMs` lists the
   delays a work queue can use.
3. **A job's body is read, then checked, before anything else.** `readJobBody` and `isUuid`
   (`src/shared/application/messaging/job-body.ts`) are shared by all four handlers: content that
   is not JSON, or JSON that is not an object, is terminal. The dummy-logs job requires its four
   ids as UUIDs and `count` as a whole number from 1 to `MAX_DUMMY_METRIC_LOGS` (1000), the same
   constant the HTTP schema caps the request with.

## Options considered

- _A queue-level TTL on the existing `<queue>.retry`._ ADR-0005 rejected it: a queue argument
  cannot change without redeclaring the queue, so tuning the delay would fail with
  `PRECONDITION_FAILED` on a broker that already has it. A tier's delay is in its name, so a new
  delay is a new queue and an existing tier never changes. ADR-0005's objection does not apply.
- _Declare every tier at startup from the environment._ The consumer takes its own
  `retryBaseDelayMs`, and a test passes one; the tiers it needs are known only to it.
- _The delayed-message plugin._ Rejected by ADR-0005: not in the stock image (ADR-0042).
- _Zod in the application layer for the payload._ No application file imports it; the email
  handlers already validate by hand.

## Consequences

- Up to about nine retry queues per work queue, with the default `RABBITMQ_MAX_RETRIES` and the
  5-minute cap, each with no consumer. A retry still survives a worker restart.
- The old `<queue>.retry` queues are no longer declared. No deployed broker uses the queue today
  (`RABBITMQ_ENABLED=false` on staging; the worker has no deployment, ADR-0040). On a local broker
  one may remain, empty or draining as before; delete it from the management UI
  (`localhost:15672`) or with `rabbitmqadmin delete queue name=<queue>.retry`.
- The same message reaching two queues is now two rows in `processed_messages`.

## Enforcement

- `__tests__/integration/queue/message-idempotency.integration.test.ts`: the same id is processed
  once on each of two queues and skipped on a second delivery to one. On the old key the first
  case failed.
- `__tests__/integration/queue/retry-tiers.integration.test.ts`: against the broker, a short retry
  scheduled after a long one comes back first, each from its own tier.
- `__tests__/unit/shared/infrastructure/queue/topology.test.ts`: a tier's declaration; no work
  queue declares the old single retry queue.
- `GenerateDummyMetricLogsHandler.test.ts` and the dummy-logs queue suite: a bad id or count parks
  at once and writes nothing.

## Links

- Kit: [`queue-design-hardening`](../../internal/initiatives/queue-design-hardening/README.md)
- Audit: `docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6 R8
