# ADR-0069 — The password-reset email is a queued job

- **Status:** Proposed
- **Date:** 2026-10-19
- **Related:** [ADR-0067](./adr-0067-the-verification-email-is-a-queued-job.md) (the same pattern,
  for the verification email); [ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md)
  (retries and parking); [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md)
  (idempotency); [ADR-0040](./adr-0040-worker-process-deployment-topology.md) (the worker has no
  deployment); [ADR-0056](./adr-0056-one-wiring-per-feature-for-every-entry-point.md) (one wiring)
- **Origin:** `D-01` to `D-04` in the durable-password-reset-email kit —
  [`durable-password-reset-email`](../../internal/initiatives/durable-password-reset-email/decisions.md);
  register row B-70 ([todo](../../internal/todos/2026-10-18-todo-reset-and-invite-email-not-durable.md))

---

## Context

`POST /auth/forgot-password` ran `RequestPasswordReset`, which invalidated the user's earlier
tokens, minted a 15-minute token and sent the email inside the request. A failed send was logged
and swallowed, and the response still said the instructions were sent, so the user waited for an
email that never came. ADR-0067 had already fixed the same defect for the verification email.

## Decision

1. **The message carries the user id only.** The request looks the address up. No user: nothing is
   published, as nothing was sent before. A user: the job is `{ userId }` on
   `auth.send-password-reset-email`. The worker loads the user by id, mints the token and sends.
   No address and no token reach the broker.
2. **Send inside the idempotency transaction.** `RequestPasswordReset.executeInTransaction`
   invalidates and saves through the transaction `MessageIdempotencyPort.runOnce` opens, then
   sends; a failed send throws, the token and the dedup record roll back together, and the
   consumer retries and finally parks. `SendPasswordResetEmailHandler` parks a malformed body at
   once. Delivery is at least once.
3. **No staleness check.** With the default retry settings the last retry runs about a minute
   after the first attempt, each delay is capped at five minutes, and the token is minted when the
   email is sent, so every link is valid for its full 15 minutes.
4. **The fallback is today's path.** With the queue off, or when a publish throws, the email is
   sent in the request, awaited, with its failure logged, exactly as before. The response is the
   same in every case, so it still does not say whether the account exists.

The queue is declared through `assertWorkQueue` in `src/shared/infrastructure/queue/topology.ts`,
and `src/worker.ts` consumes it with the handler from `buildWiredAuthFeature`.

## Options considered

- **Carry the address and look it up in the worker.** An address persisted on the broker.
- **Mint the token in the request and carry it.** A token on the broker, and a retry would send a
  link nearer its expiry.
- **Fail the request on a failed publish.** It would answer differently for a known address.
- **Fall back through `runInBackground`, as the verification email does.** It changes when an
  unqueued reset is sent, which nothing asked for; the request path already awaited the send.
- **A shared schedule-or-fallback helper for both emails.** Two cases, with different fallbacks,
  do not yet justify one.

## Consequences

- With `RABBITMQ_ENABLED=true` a failed reset email is retried and parked instead of lost. With the
  queue off, nothing changes; development, the tests and staging run that way.
- With the queue on and no worker, reset emails wait unsent, as verification emails already do.
  No deployed environment runs the worker yet (ADR-0040).
- A crash between the send and the commit sends the email twice; the second invalidates the first
  link.
- The invite email is still sent in the request (register row B-70). Moving it changes what the
  inviter sees, so it is a separate change.

## Enforcement

- `__tests__/integration/features/auth/PasswordResetEmailQueue.integration.test.ts`, against a real
  broker: the queued body is `{ userId }`; the worker's link resets the password; a failed send is
  retried with one token row (it fails when the worker's writes skip the transaction); a job that
  always fails parks; a duplicate sends once; a failed publish sends in the request.
- `__tests__/unit/features/auth/application/RequestPasswordReset.test.ts` and
  `SendPasswordResetEmailHandler.test.ts`; `topology.test.ts` declares the queue.
- `__tests__/integration/api/auth-password-reset.test.ts` passes unchanged with the queue off.

## Links

- Kit: [`durable-password-reset-email`](../../internal/initiatives/durable-password-reset-email/README.md)
