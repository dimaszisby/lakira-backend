# Durable password-reset email — Checklist

## Phase 0 — kit and branch

- [x] `fix/durable-password-reset-email` cut with `--no-track` from `origin/dev` at `98f17f6`;
      HEAD and upstream verified
- [x] `README.md`, `durable-password-reset-email-plan.md`, this file
- [x] `decisions.md` D-01 to D-04

## Phase 1 — the auth feature

- [x] `PasswordResetTokenRepository` and its Sequelize adapter — optional `tx` on `create` and
      `invalidateAllForUser`
- [x] `RequestPasswordReset` — takes a `MessageQueuePort`; `execute` publishes `{ userId }` or
      falls back to the request path; `executeInTransaction(userId, tx)` throws on a failed send
- [x] `application/use-cases/SendPasswordResetEmailHandler.ts`

## Phase 2 — plumbing and wiring

- [x] `src/shared/application/messaging/job-routes.ts` — `ROUTING_KEYS.AUTH_SEND_PASSWORD_RESET_EMAIL`
- [x] `src/shared/infrastructure/queue/topology.ts` — `QUEUES.AUTH_SEND_PASSWORD_RESET_EMAIL`,
      declared through `assertWorkQueue`
- [x] `feature.ts` — one message queue and one idempotency adapter for both emails; the handler
      built beside the use case
- [x] `src/worker.ts` — a consumer for the new queue

## Phase 3 — proof

- [x] Unit tests: `RequestPasswordReset.test.ts` (queue on, unknown address, failed publish,
      `executeInTransaction`), `SendPasswordResetEmailHandler.test.ts`, `topology.test.ts`
- [x] `__tests__/integration/features/auth/PasswordResetEmailQueue.integration.test.ts`

## Discovered

- [x] Found: `RequestPasswordReset.test.ts` asserted `invalidateAllForUser(id, now)`; the request
      path now passes an explicit `undefined` transaction → in scope, the assertion names it
- [x] Found: `c4-containers.md`, `configuration.md` and `.claude/rules/architecture.md` name only
      the verification email as queued → in scope, updated

## Acceptance

- [x] AC-1 — `PasswordResetEmailQueue.integration.test.ts` › "queues the user id only, and the
      worker's link resets the password", "queues nothing for an unknown address, and answers the
      same"; `RequestPasswordReset.test.ts` asserts the body is `{ userId }` exactly
- [x] AC-2 — › "queues the user id only, and the worker's link resets the password" (reset, then
      log in with the new password)
- [x] AC-3 — › "retries a failed send, and sends once when the retry succeeds" (one token row; it
      failed with two when the worker's writes skipped the transaction), "parks the job when every
      attempt fails"
- [x] AC-4 — › "sends one email when the same message is delivered twice";
      `SendPasswordResetEmailHandler.test.ts` parks malformed bodies
- [x] AC-5 — › "sends in the request when the publish fails, and answers the same";
      `RequestPasswordReset.test.ts` › "sends in the request, without throwing, when the publish
      fails"
- [x] AC-6 — `auth-password-reset.test.ts` passes unchanged; OpenAPI shows no drift

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — `test:coverage`: unit 1271 passed; integration 261 passed, 5 skipped
- [x] build
- [x] OpenAPI — no drift
- [ ] security delta — skipped: no dependency changes
- [ ] image smoke — skipped: no Dockerfile or dependency changes
