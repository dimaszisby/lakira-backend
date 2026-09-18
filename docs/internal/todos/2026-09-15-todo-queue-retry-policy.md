# Todo — implement the retry policy the config already promises

- **Status:** Complete (2026-09-15) — delivered by `5952b74` (#91)
- **Created:** 2026-09-15
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session — **Opus, high effort, plan mode**
- **Origin:** follow-up from the consumer-idempotency work
  ([`2026-09-15-todo-consumer-idempotency.md`](./2026-09-15-todo-consumer-idempotency.md)).
  Completes the deferred half of
  [ADR-0005](../../explanation/decisions/adr-0005-topic-exchange-with-parking-lot-dlx.md),
  **Accepted 2026-04-20**.

---

## The gap

`RABBITMQ_MAX_RETRIES` is validated in `src/config/zodEnv.ts:253` with a default of `5`, documented
in `.env.example:87`, and **read nowhere**. Those are its only two occurrences in the repo.

`RabbitMQConsumer.dispatch` (`src/shared/infrastructure/queue/RabbitMQConsumer.ts:62-83`) reads the
retry counter, logs it, and then discards it:

```ts
const retryCount = parseInt(
  (msg.properties.headers?.["x-retry-count"] as string) || "0", 10,
);
...
.catch((error: Error) => {
  logger.error("[RABBITMQ] Handler failed — sending to parking.", { retryCount, ... });
  ch.nack(msg, false, false);   // straight to the parking lot, first failure
});
```

So every failure parks immediately. The `x-retry-count` read is dead code that documents an
intention nobody implemented — and it is a useful hint about the shape that was intended.

**ADR-0005 is Accepted and the code contradicts it.** Its Consequences section says:

> Poison messages park immediately **after `RABBITMQ_MAX_RETRIES` nacks**.

They park after one. The ADR also records what it deliberately deferred:

> Full tiered retry (TTL queues) — deferred; adds significant topology complexity for PR 1
> scaffolding.

So counted retry was promised; tiered backoff was explicitly postponed. Deciding whether backoff is
in scope here is the first thing to settle — see below, because the answer is less obvious than it
looks.

## Why this is safe to build now and was not before

PR #88 (`9ebaee9`) made the consumer idempotent, and the semantics are exactly what retry needs:

- **Work failed** → `runOnce` throws, the transaction rolls back, and the `processed_messages` row
  goes with it. A retry re-does the work. Correct.
- **Work succeeded, message redelivered** → the dedup insert hits the primary key, `runOnce` returns
  `"duplicate"`, the consumer acks. No double write.

Before #88 a retry could duplicate rows. Check `SequelizeMessageIdempotency.runOnce`
(`src/shared/infrastructure/queue/SequelizeMessageIdempotency.ts:33`) yourself rather than taking
this on trust — the whole design rests on it.

## THE TRAP: counted retry with no delay is close to worthless

This is the thing to get right, and the obvious implementation gets it wrong.

Retries exist for **transient** failures — a database blip, a brief network partition, a dependency
restarting. Those take seconds. If the consumer republishes immediately, five retries are consumed
in milliseconds and the message parks anyway, having tested the same broken dependency five times in
the time it takes to blink.

The result _looks_ like a working retry policy, passes a test that throws once and succeeds on the
second attempt, and does nothing for the failure mode it was built for.

So do not treat "tiered backoff was deferred by ADR-0005" as permission to ship the delay-free
version. Decide deliberately, and say which you chose and why:

1. **Delay-free counted retry.** Honest only if you also say what it is for, because it is not for
   transient outages. Cheapest.
2. **In-process delay** before republishing. Simple, no topology change, but the delay lives in a
   `setTimeout` inside a process that can be restarted or scaled — a worker shutdown loses the
   pending retry. Interacts with the `inFlight`/drain accounting at
   `RabbitMQConsumer.ts:84-90`.
3. **TTL retry queue** — a `*.retry` queue with a per-message or per-queue TTL that dead-letters back
   to `lakira.jobs`. This is ADR-0005's own deferred design. Real backoff that survives restarts,
   at the cost of topology in `topology.ts`.
4. **Delayed-message-exchange plugin.** Note the image is `rabbitmq:3.13-management-alpine`, which
   does **not** bundle `rabbitmq_delayed_message_exchange`. This would mean a custom image, which is
   a bigger change than it appears and interacts with ADR-0042's build-once story.

(3) is the one that matches what ADR-0005 intended and what the failure mode requires. (1) is worth
doing only as a deliberate, stated stepping stone.

## The second trap: publish-then-ack, never ack-then-publish

RabbitMQ has no native retry counter and headers are immutable across a redelivery, so
`nack(requeue=true)` cannot increment anything — it produces an unbounded hot loop. A counted retry
therefore means **republishing a new message** with `x-retry-count` incremented.

Ordering matters and only one order is safe:

- **ack-then-publish** — a crash between the two **loses the message entirely**.
- **publish-then-ack** — a crash between the two duplicates it, which the idempotency guard from #88
  already absorbs.

Take the failure you can survive. `RabbitMQPublisher.publish` already accepts `headers`
(`MessageQueuePort.ts:8`, used at `RabbitMQPublisher.ts:53`), so no port change is needed — but the
consumer currently has **no publisher at all** (`grep publish` in `RabbitMQConsumer.ts` returns
nothing). How it gets one is a design decision, not a detail: injecting `MessageQueuePort` keeps the
transport layer testable, reaching for a raw channel does not.

## The third trap: not every failure deserves a retry

Some failures are terminal and retrying them just delays the inevitable while burning the budget:

- `InvalidMessageIdError` (`SequelizeMessageIdempotency.ts:19`) — a message with no usable
  `messageId` will never acquire one.
- A `JSON.parse` failure on `msg.content` — malformed forever.
- `ensureMetricOwnership` rejecting — the metric will not start belonging to that user.

Decide whether terminal failures park immediately or go round the loop. Parking them at once is
better behaviour and needs a way to distinguish the two — an error type, a marker interface, or an
explicit list. Whatever you choose, it must not silently swallow an unrecognised error as terminal:
defaulting to _retryable_ fails safe.

## Scope

The retry loop in `RabbitMQConsumer`, whatever topology the chosen option needs, and tests. Update
ADR-0005 — a new ADR is not needed if you implement what it already decided, but if you choose
option 1 over its stated intent, that reversal **does** need recording.

**Out of scope:** parking-lot depth monitoring (still unbuilt, still ADR-0005's other open
consequence), ADR-0038 queue observability, and the `processed_messages` cleanup job
(`2026-09-15-todo-processed-messages-cleanup.md`).

## Verification

Extend `__tests__/integration/features/metric-log/GenerateDummyMetricLogsQueue.integration.test.ts`
— it already runs a real consumer against a real broker through the real HTTP route and asserts exact
row counts and queue depths. Do not build a second harness.

The tests that prove this work:

1. A handler failing **once** then succeeding → the work completes, the parking lot stays empty, and
   exactly one set of rows exists. Not two — this is where idempotency and retry meet.
2. A handler failing **always** → exactly `RABBITMQ_MAX_RETRIES` retries, then the parking lot, with
   `x-retry-count` proving the count rather than a timer inferring it.
3. A terminal failure → parks immediately, retry count `0`, whichever way you resolved trap three.

```bash
npm run lint && npm run typecheck && npm run format:check && npm run docs:openapi:check
npm test

# Five consecutive runs. The bar from PR #86 stands for async tests.
for i in 1 2 3 4 5; do npm run test:integration -- --runTestsByPath <path> -t "<name>"; done
```

Note `npm run test:integration -- <path>` does **not** filter — `--selectProjects` swallows the path
and the whole suite runs. Use `--runTestsByPath`. That was found the hard way during PR #88.

**Capture exit codes directly.** `npm run x | tail` reports `tail`'s status and
`echo "$(cmd) exit=$?"` reports the substitution's; both have produced falsely-green readings in
recent sessions.

**And prove the negative:** with `RABBITMQ_MAX_RETRIES=0`, behaviour must be identical to today —
park on first failure. If that test passes before your change as well as after, it is the only one in
the set that is allowed to.

## Conventions

- Branch: `git checkout -b feat/queue-retry-policy --no-track origin/dev`
- **Verify `git rev-parse --abbrev-ref HEAD` before committing**
- Never blanket-stage; name explicit paths (a `pre-commit` hook enforces it)
- A **protected-files hook** blocks edits to Compose and CI files even after approval. If this needs
  one, deliver it as a patch for the user to apply.
- Conventional Commits; message to `$(git rev-parse --git-dir)/COMMIT_DRAFT`, shown in chat, applied
  with `git commit -F`. No `Co-Authored-By` or Claude references
- The user opens PRs and merges — do not commit, push, or open PRs
- Record the outcome as a Review section appended to this file, heading level `##`

## Review

Completed 2026-09-15 on `feat/queue-retry-policy`, branched `--no-track` from `origin/dev` @ `3eb5b23`.

### What was chosen, and why

**Option 3 — the TTL retry queue.** It is ADR-0005's own deferred design, so ADR-0005 was updated and no new ADR was needed. The other three options were rejected:

- **Option 1 (no delay)** spends every retry in milliseconds against the same broken dependency.
- **Option 2 (`setTimeout`)** loses pending retries on shutdown and holds `drain()` open.
- **Option 4 (delayed-message plugin)** needs a custom image, against ADR-0042.

Design details:

- **Topology.**
  - Each work queue gets `<queue>.retry`, which has no consumer.
  - An expired message dead-letters through the default exchange, so it goes straight back to the queue that failed it and not through `lakira.jobs`.
- **Delay.**
  - The delay is a per-message `expiration`, not `x-message-ttl`. A queue argument cannot be tuned later without `PRECONDITION_FAILED` on every deployed broker.
  - Backoff is `RABBITMQ_RETRY_BASE_DELAY_MS × 2^n`, capped at 5 minutes. That variable is new, with a default of 2000, giving 2, 4, 8, 16 and 32 s.
  - Accepted trade-off, recorded in ADR-0005: per-message TTL can stretch a delay (head-of-line blocking). It never shortens a delay and never loses a message.
- **Ordering.**
  - The consumer publishes the retry, waits for the broker confirm, then acks the original.
  - If the republish fails, the message is parked. Nothing ever uses `requeue=true`.
- **How the consumer publishes.** `MessageQueuePort` is injected through `ConsumerOptions.publisher` (required). The only port change is the additive, optional `PublishOptions.expirationMs`.
- **Terminal errors.**
  - New `TerminalMessageError`. `InvalidMessageIdError` now extends it.
  - The handler wraps a `JSON.parse` failure, and `AppError` 401/403/404 from `ensureMetricOwnership`. A DB error from that same call stays retryable.
  - Anything unrecognised is retried.
- **Decision logic** is a pure function (`retryPolicy.ts`) with its own unit tests.

### Found during verification

A mutation run with terminal classification disabled exposed a real hole. A message with **no messageId** that failed _before_ the dedup guard would be republished, and `RabbitMQPublisher` would mint it a fresh UUID. The retry would then process under an identity the original never had, bypassing ADR-0007's refusal of unidentifiable messages.

- **Fix:** the consumer parks such a message rather than retrying it.
- **Test:** a dedicated test that fails without the guard; second mutation run below.

### Evidence

Every exit code below was captured directly (`cmd > log; ec=$?`), never through a pipe or a command substitution.

| Check                                                                           | Result                                                                                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`, `typecheck`, `format:check`, `docs:openapi:check`                       | all exit 0; the OpenAPI check validated 46 operations                                                                                                 |
| `npm test`                                                                      | exit 0 — unit 563/563, integration 192 passed + 5 skipped (197)                                                                                       |
| New retry tests, five consecutive runs (`--runTestsByPath … -t "retry policy"`) | 5/5 exit 0, 5 passed each time                                                                                                                        |
| New tests against the **pre-change** consumer (worktree at `origin/dev`)        | fails before the change: fails-once-then-succeeds, always-fails. Passes before the change: `RABBITMQ_MAX_RETRIES=0` and the terminal test (see below) |
| Mutation: terminal classification disabled                                      | fails: the terminal test (retried instead of parked) and "parks a message that carries no messageId"                                                  |
| Mutation: no-messageId guard disabled                                           | fails: the new no-messageId test times out; the message is retried and processed instead of parked                                                    |

**Deviation from the brief.** The terminal-failure test also passes against the pre-change consumer. That cannot be designed away: the old code parks _every_ failure at once. What the test guards against is the new failure mode, a terminal error being retried, and the first mutation row proves it catches that.

The existing "rolls back the dedup record" test injects a retryable error, so it now pins `maxRetries: 0` to keep its operator-replay semantics.

### Not done / for the user

- **`.env.test.example` was not edited.** The protect-files hook blocked it; the same hook allowed `.env.example`. Add `RABBITMQ_RETRY_BASE_DELAY_MS=2000` after `RABBITMQ_MAX_RETRIES` by hand. The schema default is the same value, so nothing breaks without it.
- **Schemathesis 37/46 was not run locally.** No routes changed and the operation count is still 46.
- **Still out of scope:** parking-lot depth monitoring, ADR-0038 observability, and the `processed_messages` cleanup job.
- **Brief fact correction:** `RABBITMQ_MAX_RETRIES` also appeared in `.env.test.example` and three docs. The claim "read nowhere" was true of code.
