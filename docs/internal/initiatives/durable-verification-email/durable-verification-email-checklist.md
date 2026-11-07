# Durable verification email — Checklist

## Phase 0 — kit and branch

- [x] `fix/durable-verification-email` cut with `--no-track` from `origin/dev` at `cbb7b87`; HEAD
      and upstream verified
- [x] `README.md`, `durable-verification-email-plan.md`, this file
- [x] `decisions.md` D-01 to D-04

## Phase 1 — queue plumbing

- [x] `src/shared/application/messaging/job-routes.ts` — `ROUTING_KEYS.AUTH_SEND_VERIFICATION_EMAIL`
- [x] `src/shared/infrastructure/queue/topology.ts` — `QUEUES.AUTH_SEND_VERIFICATION_EMAIL`; both
      work queues declared through `assertWorkQueue`
- [x] `src/shared/infrastructure/queue/RabbitMQPublisher.ts` — every publish has a timeout, set on
      the channel (`publishTimeout`), so the consumer's retry republish is bounded too

## Phase 2 — the auth feature

- [x] `EmailVerificationTokenRepository` and its Sequelize adapter — optional `tx` on `save` and
      `revokeAllForUser`
- [x] `RequestEmailVerification.executeInTransaction(userId, tx)` — throws on a failed send
- [x] `application/use-cases/SendVerificationEmailHandler.ts`
- [x] `application/use-cases/ScheduleEmailVerification.ts`

## Phase 3 — wiring

- [x] `feature.ts` — `messageQueue` and `idempotency` overrides; both new pieces built
- [x] `src/composition/auth.ts` — `buildWiredAuthFeature`
- [x] `infrastructure/http/controller.ts` — `installAuthFeature`; register and resend schedule
- [x] `src/server.ts` — one publisher for metric-log and auth; auth installed
- [x] `src/worker.ts` — a consumer for the new queue
- [x] `__tests__/unit/architecture.test.ts` — auth's entry-point wiring

## Phase 4 — proof

- [x] Unit tests: the schedule, the handler, `executeInTransaction`, the publisher timeout, the
      topology helper
- [x] `__tests__/integration/features/auth/VerificationEmailQueue.integration.test.ts`
- [x] Manual: server and worker run from source with `RABBITMQ_ENABLED=true` against the
      Compose broker; a registration reached Mailpit through the worker, nothing in process

## Discovered

- [x] Found: `RequestEmailVerificationInput.email` was never read; the use case emails the address
      in the database → in scope, removed
- [x] Found: ADR-0054 names the labels `verification-email:register` and `:resend` → in scope, kept
      by passing the reason through `ScheduleEmailVerification`
- [x] Found: the controller test "answers 200 even when the verification email fails in the
      background" tested a failure the controller no longer handles → in scope, removed; the
      guarantee is now `ScheduleEmailVerification.test.ts` › "sends in process, without throwing,
      when the publish fails" and the integration fallback case
- [x] Found: with `RABBITMQ_ENABLED=true` and no worker, verification emails wait unsent, and no
      deployed environment runs the worker (ADR-0040) → documented in ADR-0067,
      `docs/reference/configuration.md` and `c4-containers.md`; deploying the worker is ADR-0040's
- [x] Found: the password-reset and invite emails are not retried either → out of scope, filed as
      `docs/internal/todos/2026-10-18-todo-reset-and-invite-email-not-durable.md` (B-70)

## Acceptance

- [x] AC-1 — `VerificationEmailQueue.integration.test.ts` › "queues the user id only, and the
      worker's email verifies the account", "queues the email on resend too"; manual run with the
      worker reached Mailpit
- [x] AC-2 — › "retries a failed send, and sends once when the retry succeeds" (one token row; a
      mutation that sent outside the transaction failed it), "parks the job when every attempt
      fails"
- [x] AC-3 — › "sends one email when the same message is delivered twice"
- [x] AC-4 — › "sends in process when the publish fails, and still answers 201";
      `ScheduleEmailVerification.test.ts`
- [x] AC-5 — the existing register, resend and verify integration tests pass unchanged
- [x] AC-6 — the integration test reads the queued body; `ScheduleEmailVerification.test.ts`
      asserts it is `{ userId }` exactly
- [x] AC-7 — `architecture.test.ts` › "takes the auth feature from the shared wiring"; lint

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests
- [x] build
- [x] OpenAPI
- [ ] security delta — skipped: no dependency changes
- [x] image smoke
