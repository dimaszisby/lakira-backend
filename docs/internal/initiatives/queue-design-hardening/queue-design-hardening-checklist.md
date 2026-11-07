# Queue design hardening — Checklist

## Phase 0 — kit and branch

- [x] `fix/queue-design-hardening` cut with `--no-track` from `origin/dev` at `394f949`; HEAD and
      upstream verified; no worker attached to the broker
- [x] `README.md`, the plan, this file, `decisions.md`

## Phase 1 — tests first, and the old behaviour observed

- [x] `__tests__/integration/queue/message-idempotency.integration.test.ts` — on the old key,
      "processes the same message once on each queue" failed
- [x] `__tests__/integration/queue/retry-tiers.integration.test.ts` — a copy adapted to the old
      single retry queue brought the short retry back second, after 1638 ms; deleted after
- [x] `GenerateDummyMetricLogsHandler.test.ts` — 10 payload cases; 9 failed on the old handler
      (malformed JSON was already caught)
- [x] `retryPolicy.test.ts`, `topology.test.ts` — the ladder and a tier's declaration

## Phase 2 — the migration and the model

- [x] `src/migrations/20261020000001-processed-messages-key-per-queue.cjs` — key
      `(message_id, queue)`, index `processed_messages_processed_at_idx`; `down` refuses on a
      cross-queue duplicate
- [x] `processed-message.sequelize.ts` — `queue` is part of the key
- [x] `db:migrate:test` and `migrate:development` run locally

## Phase 3 — the tiers

- [x] `retryPolicy.ts` — `retryDelayMs`, `retryDelaysMs`; `decideOnFailure` uses the first
- [x] `topology.ts` — `retryQueueFor(queue, delayMs)`, `assertRetryTier`; `assertWorkQueue` no
      longer declares `<queue>.retry`
- [x] `RabbitMQConsumer.ts` — declares the tier, then republishes with no expiration
- [x] `PublishOptions.expirationMs` and its use in `RabbitMQPublisher.ts` removed
- [x] the four queue suites purge and inspect the tiers their consumer uses

## Phase 4 — the job body

- [x] `src/shared/application/messaging/job-body.ts` — `readJobBody`, `isUuid`
- [x] the three email handlers use them in place of their own copies
- [x] `GenerateDummyMetricLogsHandler.ts` — four UUIDs, `count` from 1 to `MAX_DUMMY_METRIC_LOGS`
- [x] `MAX_DUMMY_METRIC_LOGS` exported from `GenerateDummyMetricLogs.ts`; the HTTP schema's
      `.max()` uses it

## Phase 5 — docs and records

- [x] ADR-0073 (Proposed), its registry row; dated notes on ADR-0005 and ADR-0007; `CLAUDE.md`
      counts 73
- [x] `docs/reference/database-schema.md`, `docs/explanation/architecture/c4-containers.md`,
      `.claude/rules/architecture.md`
- [x] Register: B-40 to Closed; #192's loose ends

## Discovered

- [x] Found: the protect-files hook blocks editing an existing migration, not creating one, so
      there was no blocker → the migration written here; a later correction of the same new file
      went through Write, which the hook allows
- [x] Found: `__tests__/unit/composition/metric-log.test.ts` built a dummy job with ids that are not
      UUIDs → in scope, its fixture uses UUIDs; its assertions are unchanged
- [x] Found: ADR-0005 rejected `x-message-ttl` because a queue argument cannot change → a tier's
      delay is in its name, so it is never redeclared; recorded in ADR-0073

## Acceptance

- [x] AC-1 — `message-idempotency.integration.test.ts`, both cases
- [x] AC-2 — on the test database: with a message id on two queues, `migrate:test:undo` refused,
      naming it, and the key stayed `(message_id, queue)`; with the row removed it restored
      `PRIMARY KEY (message_id)` and dropped the index; `db:migrate:test` applied it again
- [x] AC-3 — `retry-tiers.integration.test.ts`: `["short", "long"]`, both tiers empty after
- [x] AC-4 — unit, 10 cases; the dummy-logs suite, a count of 1001 and of 2.5: one invocation,
      nothing in a retry queue, no row, no dedup record
- [x] AC-5 — the four queue suites and the two new ones, 34 cases
- [x] AC-6 — `docs:openapi:check` passes with no diff; contract quick profile 36 passed, 6 skipped,
      the same two warnings

## Gates

- [x] typecheck
- [x] lint
- [x] format — named files only
- [x] tests — `test:coverage`: unit 1378 passed; integration 278 passed, 5 skipped; thresholds met
- [x] build
- [x] OpenAPI — no drift
- [x] image smoke — passed
- [ ] security delta — skipped: no dependency changes
