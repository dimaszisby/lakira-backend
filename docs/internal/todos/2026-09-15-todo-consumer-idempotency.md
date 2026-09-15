# Todo — implement ADR-0007 idempotency in the consumer

- **Status:** Ready to start — this is the brief, not a plan
- **Created:** 2026-09-15
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session — **Opus, high effort, plan mode**
- **Origin:** follow-up 2 from the worker/queue coverage work
  ([`2026-09-15-todo-worker-queue-coverage.md`](./2026-09-15-todo-worker-queue-coverage.md)).
  Implements [ADR-0007](../../explanation/decisions/adr-0007-processed-messages-table-for-idempotency.md),
  **Accepted 2026-04-20**.

---

## Correction to carry forward

The handoff that raised this said _"there's no `processed_messages` table."_ **There is.**
`src/migrations/20260420000000-create-processed-messages.cjs` creates it, and two later migrations
reference it:

```
message_id    STRING(36)  PRIMARY KEY  NOT NULL
queue         STRING(255)              NOT NULL
processed_at  DATE        NOT NULL     DEFAULT NOW()
```

The table has existed since April, empty and unread. What was never built is the **consumer side**:
no Sequelize model, no repository, no check in any handler. Do not start by writing a migration —
start by reading the one that is already there.

## Why this matters now and did not last week

Until PR #86 (`85b4e77`), `src/worker.ts` had never run, so redelivery was theoretical. The queue
path is now exercised locally and in CI, and will run in production under ADR-0042. RabbitMQ is
at-least-once by design: a consumer that crashes after its side effect but before its ack **will**
see the message again.

`GenerateDummyMetricLogsHandler.handle` (`application/use-cases/GenerateDummyMetricLogsHandler.ts:22`)
does this:

```ts
await this.access.ensureMetricOwnership(userId, organizationId, metricId);
for (let i = 0; i < count; i++) {
  await models.MetricLog.create({ ... });   // no transaction
}
```

So a redelivered message inserts `count` rows a second time. There is **no transaction at all**,
which means a failure midway also leaves a partial write behind before the message is nacked.

## What ADR-0007 actually requires

> Consumer handlers check this table and insert inside the **same DB transaction as the side
> effect**. A duplicate `message_id` triggers a PK conflict → handler acks and skips.

The transaction requirement is the whole decision, not a detail. Read the next section before
choosing where to put the check.

## THE TRAP: a centralised check without a shared transaction is worse than none

Putting the dedup in `RabbitMQConsumer.dispatch` is the tidier-looking option — one place, every
queue covered. It is also wrong unless the transaction reaches the handler, and it fails in a
direction that is hard to see:

1. consumer marks `message_id` processed and commits
2. handler throws
3. `dispatch` nacks → the message goes to the parking lot (`RabbitMQConsumer.ts:76`)
4. someone replays it from the parking lot
5. it is now **silently skipped** as already-processed, having never done its work

That is a message the system claims to have handled and did not. Losing work quietly is worse than
duplicating it visibly.

So either the check lives inside the handler alongside its own transaction, or the consumer opens a
transaction and passes it down. Both are defensible; pick one, say why, and make sure the
mark-processed write and the side effect commit or roll back together.

## Smaller traps, all verified

- **`timestamps: false` is mandatory on the model.** `db.ts:85-89` sets global defaults
  `underscored: true, timestamps: true`. The migration created **no** `created_at`/`updated_at`, so a
  model taking the default will generate SQL selecting columns that do not exist.
- **`freezeTableName: false` is also global**, so Sequelize pluralises. Set `tableName:
"processed_messages"` explicitly rather than relying on inflection.
- **`underscored: true` maps `messageId` → `message_id`** automatically. Do not hand-write the
  snake_case attribute names.
- **The handler does not know its queue name.** `processed_messages.queue` is `NOT NULL`, and
  `ConsumeMessage` carries `fields.routingKey` and `fields.consumerTag` but not the queue.
  `RabbitMQConsumer` has it as `options.queue` (`:11`). It has to be passed down — that is part of
  the design question above, not an afterthought.
- **`msg.properties.messageId` can be absent.** `RabbitMQPublisher` sets it from `jobId`
  (`GenerateDummyMetricLogs.ts:48`), so today it is always a 36-char UUID and fits the column. A
  message published by anything else may not carry one. Decide explicitly: reject it, or process it
  without dedup. Do not let `undefined` reach a `STRING(36)` primary key.
- **Where the model lives is a real choice.** Every existing `register*Models` function sits under a
  feature (`src/features/*/infrastructure/persistence/models/`). `processed_messages` belongs to none
  of them — it is shared queue infrastructure. It needs a home and a registration in
  `src/infrastructure/db/models.ts:25-30`.

## Scope

The model, its registration, the dedup check wired into the transaction, and a test that proves
redelivery does not duplicate.

**Out of scope:** the retry policy (`RABBITMQ_MAX_RETRIES` is validated in `zodEnv.ts:253` and read
nowhere — every failure goes straight to the parking lot; that is a separate follow-up), parking-lot
monitoring, and ADR-0038 queue observability.

**Note but do not build:** ADR-0007's own Consequences section says the table _"grows unbounded — a
periodic cleanup job (delete rows older than N days) should be added in a follow-up."_ Still true,
still unbuilt. Raise it as its own todo rather than folding it in here.

## Verification

The suite from PR #86 is the foundation —
`__tests__/integration/features/metric-log/GenerateDummyMetricLogsQueue.integration.test.ts` already
runs a real consumer against a real broker through the real HTTP route, and already asserts exact row
counts. Extend that pattern; do not invent a second harness.

The test that proves this work: **publish the same `messageId` twice and assert `count` rows total,
not `2 × count`.** Then assert the second delivery was acked, not parked — a skip must look like
success to the broker.

```bash
npm run lint && npm run typecheck && npm run format:check && npm run docs:openapi:check
npm test

# Five consecutive runs — this is an async test and the bar set in PR #86 stands.
for i in 1 2 3 4 5; do npm run test:integration -- -t "<new test name>"; done
```

**Capture exit codes directly.** `npm run x | tail` reports `tail`'s status, and
`echo "$(cmd) exit=$?"` reports the substitution's — both have produced falsely-green readings in
recent sessions, the second one during PR #86 itself.

**And prove the negative, twice over:**

1. With the dedup removed, the same test must fail with `2 × count` rows. A test that passes either
   way proves nothing — this repo has removed three gates that could not fail.
2. A handler that throws must leave **no** `processed_messages` row behind. That is the trap above,
   and it is the one failure mode that loses work rather than duplicating it.

## Conventions

- Branch: `git checkout -b feat/consumer-idempotency --no-track origin/dev`
- **Verify `git rev-parse --abbrev-ref HEAD` before committing**
- Never blanket-stage; name explicit paths (a `pre-commit` hook enforces it)
- A **protected-files hook** blocks edits to Compose and CI files even after approval — PR #86 hit
  this. If this work needs one, deliver it as a patch for the user to apply.
- Conventional Commits; message to `$(git rev-parse --git-dir)/COMMIT_DRAFT`, shown in chat, applied
  with `git commit -F`. No `Co-Authored-By` or Claude references
- The user opens PRs and merges — do not commit, push, or open PRs
- Record the outcome as a Review section appended to this file

---

## Review — 2026-09-15

**Status:** Done on `feat/consumer-idempotency`, branched from `origin/dev` at `c0efebc`. Not yet
committed.

### A second correction to carry forward

The table has **four** columns, not three. `20260510000005` added `organization_id UUID NULL →
organizations(id) ON DELETE SET NULL`, and `20260510000006` indexed it and deliberately left it
nullable. The model declares it, and the handler fills it from the job payload. No migration was
needed.

### Decisions

- **The check lives in the handler, through a shared guard, not in `RabbitMQConsumer.dispatch`.**
  Two reasons. Opening the transaction in the consumer would push Sequelize into the transport
  layer and wrap every handler in a transaction whether it needs one or not. It would also run
  non-DB side effects before commit: the handler's cache invalidation would let a reader re-cache
  pre-commit state. The mechanics are written once, in
  `MessageIdempotencyPort.runOnce(key, work)`, implemented by `SequelizeMessageIdempotency`. It
  inserts the `processed_messages` row and runs `work(tx)` in **one** transaction. The handler
  invalidates the cache only after `runOnce` resolves `"processed"`.
- **Only the dedup insert can signal a duplicate.** Its `UniqueConstraintError` becomes a private
  sentinel that rolls back the transaction and resolves `"duplicate"`. A unique violation raised
  inside `work` fails the message instead, so it can't be mistaken for a skip. With concurrent
  deliveries of one id, the second insert blocks on the first. If the first commits, the second
  skips. If the first rolls back, the second does the work.
- **A skip is an ack.** `runOnce` resolves on a duplicate, so `dispatch` takes its ordinary ack
  path. `dispatch` itself is unchanged apart from passing context.
- **The queue name comes from the consumer.** `MessageHandler` is now
  `(msg, { queue }) => Promise<void>`, and `options.queue` remains the single source.
- **A missing or unusable `messageId` is rejected**, meaning parked, not processed without dedup.
  Processing it unguarded would reintroduce the bug ADR-0007 prevents. Parking makes the publisher
  visible. The adapter requires a string of 1–36 characters, so `undefined` never reaches the PK.
- **The model lives in `src/shared/infrastructure/queue/persistence/`.** It's shared queue
  infrastructure. It has `tableName: "processed_messages"` and `timestamps: false`, and is
  registered in `models.ts`. It has no associations, so there is no `associate` function.
- **The handler is now transactional.** A mid-loop failure rolls back its partial rows, which it
  previously left behind.
- The architecture guard (`__tests__/unit/architecture.test.ts`) forbids `from "sequelize"` in
  application code. The handler therefore derives its transaction type from
  `models.MetricLog.create`'s signature instead of importing `Transaction`.

### Verification

The harness from PR #86 was extended. No second harness.

| Test (real broker, real consumer)                                             | Proves                                                                                                    |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| acks and skips a redelivered message with the same messageId                  | 4 rows, not 8; parking empty (duplicate acked); one `processed_messages` row with the right queue         |
| rolls back the dedup record when the handler fails, so a replay does the work | failure on the 3rd insert → parked, 0 rows, **0** dedup rows; replaying the same id writes all 5 and acks |
| parks a message that carries no messageId                                     | parked, 0 rows, 0 dedup rows                                                                              |

Every exit code below was captured directly (`cmd > log; code=$?`), with no pipes.

- `lint` 0 · `typecheck` 0 · `format:check` 0 · `docs:openapi:check` 0. Still 46 operations and
  no spec diff, so the Schemathesis selection (37/46) is unaffected.
- `test:unit`: 556 passed, exit 0. `test:integration`: 187 passed, 5 skipped, exit 0.
- New tests, five consecutive runs: exit 0 ×5, 3 passed each.

**Negative proofs.** Each was a temporary edit, confirmed reverted by grep:

1. **Dedup defeated** (a unique key per delivery, transaction kept): the redelivery test failed
   with `Expected: 4, Received: 8`, exit 1.
2. **Dedup insert moved outside the transaction** (autocommits, the brief's trap): the rollback
   test failed with `Expected: 0, Received: 1` on the `processed_messages` count, exit 1. A
   handler failure left the message marked processed.

### Follow-ups

- Periodic cleanup of `processed_messages`, raised as
  [`2026-09-15-todo-processed-messages-cleanup.md`](./2026-09-15-todo-processed-messages-cleanup.md).
  Not built.
- Still out of scope and unchanged: the retry policy (`RABBITMQ_MAX_RETRIES` is read nowhere),
  parking-lot monitoring, and ADR-0038 queue observability.
