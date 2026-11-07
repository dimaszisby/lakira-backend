# Worker cancel and one connection per job — Checklist

## Phase 0 — kit and branch

- [x] `fix/worker-cancel-and-one-connection-per-job` cut with `--no-track` from `origin/dev` at
      `b3054cb`; HEAD and upstream verified
- [x] `README.md`, the plan, this file, `decisions.md` with D-01 to D-04; the register's D-06

## Phase 1 — tests first, each seen to fail

- [x] `__tests__/unit/shared/infrastructure/queue/RabbitMQConsumer.test.ts` — `cancel()` cancels the
      tag on the raw channel; a `setup` run after `cancel()` does not consume; the latest channel's
      tag is the one cancelled: three of the four failed (the fourth guards a refused cancel)
- [x] `__tests__/integration/queue/consumer-cancel.integration.test.ts` — after `cancel()`, the
      broker reports 0 consumers on the queue while the channel is open, and a message published
      after it stays in the queue: both failed (1 consumer; the message was taken)
- [x] `__tests__/integration/features/auth/email-jobs-concurrency.integration.test.ts` — 8
      verification, 8 reset and 8 invite jobs at once complete within 15 s, each sending once:
      failed at the 30 s test timeout, the pool deadlocked
- [x] Unit tests of the three use cases — `findById` receives `tx`: three cases failed; one existing
      case had pinned the bug (`RequestPasswordReset.test.ts` expected `findById(user.id)` alone)
- [x] `TimeoutEmailSender` unit test — a send that never settles rejects after the bound; a fast
      one passes through

## Phase 2 — the fixes

- [x] `src/shared/infrastructure/queue/RabbitMQConsumer.ts` — the raw channel kept beside its tag,
      a stopping flag, `cancel` on the raw channel (D-01)
- [x] `UserRepository`, `OrganizationRepository` and their Sequelize adapters — `findById(id, tx?)`
      (D-02)
- [x] `RequestEmailVerification`, `RequestPasswordReset`, `InviteUserToOrganization` — pass `tx`
- [x] `TimeoutEmailSender`, `EMAIL_SEND_TIMEOUT_MS`, wired in auth's `feature.ts`; the Mailpit
      sender's `fetch` takes `AbortSignal.timeout` (D-03)

## Phase 3 — gates, review, docs

- [x] Review of the whole diff; one finding, the late-registration race (Discovered)
- [x] ADR-0077 (Proposed), its registry row, next free 0078; D-02 and D-03 collapsed to pointers;
      `CLAUDE.md` counts 77
- [x] ADR-0076 status note: the worker's drain now stops intake
- [x] `.claude/rules/architecture.md` § Post-response work — the `runOnce` rule
- [x] Register: B-74 and B-75 to Closed naming the branch; both todos closed
- [x] #197's loose ends: the `saas-reaudit-2026-10-20` kit's D-01 to D-05 Accepted and README Done;
      the register's D-05 Accepted; "As of" `b3054cb`; the `A1020` definition names #197

## Discovered

- [x] Found in review: a `cancel()` that runs while a reconnect's `consume` is still pending
      returns with no tag to cancel, and the consumer then registers and stays → in scope (D-01):
      `setup` cancels the new tag at once when stopping; test "cancels a consumer whose registration
      finishes after cancel", seen to fail
- [x] Found: `UserRepositorySequelize.test.ts` pinned `findByPk("user-1")` exactly → in scope:
      expects the `{ transaction }` option, plus a case that passes one
- [x] Found: the Mailpit sender's `signal` had no test → in scope: "gives the request an abort
      signal", seen to fail with the source change stashed

## Acceptance

- [x] AC-1 — `consumer-cancel.integration.test.ts` › leaves no consumer on the queue; › takes no
      message published after cancel. Rerun of the dated run's reproduction on the built worker:
      `rabbitmqctl list_consumers` showed 0 consumers 1, 2, 4 and 6 s into the drain (it showed 1
      before the fix)
- [x] AC-2 — `RabbitMQConsumer.test.ts` › does not consume again when a reconnect runs setup after
      cancel; › cancels a consumer whose registration finishes after cancel
- [x] AC-3 — `email-jobs-concurrency.integration.test.ts`: 24 jobs complete, one email each.
      Rerun of the dated run's reproduction: 12 queued verification emails delivered within 1 s, no
      failure into retry (61 s and seven retries before)
- [x] AC-4 — the three use-case tests assert `findById(…, tx)`; `UserRepositorySequelize.test.ts` ›
      reads by id through a transaction it is given
- [x] AC-5 — `TimeoutEmailSender.test.ts` › rejects a send that has not settled by the bound;
      `MailpitEmailSender.test.ts` › gives the request an abort signal
- [x] AC-6 — the queue integration tests (verification, reset, invite, dummy logs, retry tiers)
      pass unchanged

## Gates

Run on Node 24.22.0 after the last change.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0; prettier run on the touched files only
- [x] tests — `test:coverage` exit 0: unit 1449 passed; integration 286 passed, 5 skipped;
      thresholds met
- [x] build — exit 0
- [x] image smoke — `docker:smoke` exit 0, seven checks
- [ ] OpenAPI — skipped: no route, Zod schema or `src/lib/openapi/**` touched
- [ ] security delta — skipped: no dependency change
