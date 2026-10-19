# ADR-0067 — The verification email is a queued job

- **Status:** Accepted (merged in #184, `975de82`)
- **Date:** 2026-10-18
- **Related:** supersedes the verification-email part of
  [ADR-0054](./adr-0054-post-response-work-is-tracked-and-drained.md);
  [ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md) (retries and parking),
  [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md) (idempotency),
  [ADR-0040](./adr-0040-worker-process-deployment-topology.md) (the worker has no deployment),
  [ADR-0056](./adr-0056-one-wiring-per-feature-for-every-entry-point.md) (one wiring);
  [ADR-0069](./adr-0069-the-password-reset-email-is-a-queued-job.md) (the password-reset email,
  the same way)
- **Origin:** `D-01` to `D-04` in the durable-verification-email kit —
  [`durable-verification-email`](../../internal/initiatives/durable-verification-email/decisions.md);
  register row B-39 ([todo](../../internal/todos/2026-10-02-todo-durable-email-delivery.md))

---

## Context

`POST /auth/register` and `POST /auth/resend-verification` sent the verification email after the
response, through `runInBackground` (ADR-0054). The work existed only in memory: a crash, a
SIGKILL or a drain timeout lost it, and `RequestEmailVerification` logged a failed send and never
retried it. The user then had to ask again.

The queue already had what the email lacked: a consumer that retries with exponential backoff and
parks a message after `RABBITMQ_MAX_RETRIES` (ADR-0005), and a guard that records each message in
the same transaction as its work (ADR-0007). Its one job so far was the dummy metric logs.

## Decision

1. **With `RABBITMQ_ENABLED=true` the email is a job.** `ScheduleEmailVerification` publishes to
   the jobs exchange with routing key `auth.send-verification-email`, consumed from
   `<prefix>.auth.send-verification-email` by `SendVerificationEmailHandler` in `src/worker.ts`.
   The queue and its retry queue are declared by `assertWorkQueue`, the helper every work queue
   now goes through.
2. **The message is `{ "userId": "<uuid>" }`** with a random message id. The worker reads the
   address from the database and mints the token itself, so neither an address nor a token
   enters the broker, and every attempt carries a fresh link.
3. **The send runs inside the idempotency transaction.** The handler revokes the user's earlier
   tokens, saves a new one and sends, all inside `runOnce`. A failed send throws: the token and
   the dedup record roll back together and the consumer retries. Malformed JSON or a body without
   a UUID `userId` is terminal and parks at once. A user who is gone or already verified is
   processed with no email.
4. **A failed publish falls back to today's path.** If the publish throws, the request logs a
   warning with the user id and sends in process through `runInBackground`, under the same labels
   as before (`verification-email:register`, `verification-email:resend`). With the queue off,
   that is the only path. The response never changes.
5. **Every publish has a timeout,** `PUBLISH_TIMEOUT_MS` (3 s) on the publisher channel. Before, a
   publish made while the broker was unreachable waited for a reconnect indefinitely.
6. **Server and worker build auth from one place,** `buildWiredAuthFeature` in
   `src/composition/auth.ts`. The server passes its publisher, shared with metric-log; the
   worker passes none.

## Options considered

- **An outbox table** drained by a sender, written in the same transaction as the token. Durable
  without a broker, but it needs a migration, a polling sender, and its own retry and
  dead-letter handling, which the queue already has.
- **Retries in process.** Still lost on a crash, which is the defect.
- **The token minted in the request, the link in the message.** Puts a credential in the broker,
  and a retry would resend a link that may have expired.
- **Send after the commit.** A failed send would leave the message recorded as processed, and its
  retry would be skipped as a duplicate: the email would never go.
- **Fail the request when the publish fails.** Register would answer 5xx after the account is
  committed. Rejected by the owner.

## Consequences

- **At least once.** A send that succeeds and a commit that then fails sends the email twice. The
  transaction stays open for one send; there is one per registration or resend.
- **Where `RABBITMQ_ENABLED=true`, the worker must run.** Without a consumer, verification emails
  wait in the queue and nobody receives one. No deployed environment runs the worker yet
  (ADR-0040), so the flag stays off there until one does. The worker needs the same email
  settings as the server: `EMAIL_PROVIDER` and its key, `EMAIL_FROM`, `FRONTEND_VERIFY_URL`,
  `EMAIL_VERIFICATION_TTL_SEC`.
- **An unreachable broker costs up to 3 s** on register and resend before the fallback. The
  dummy-logs publish now fails after 3 s instead of hanging.
- Each job adds a row to `processed_messages`, which nothing cleans up (B-41, deliberately not
  built).
- Password reset and invites are still sent inside the request, with no retry. They are a
  register row of their own.

## Enforcement

- `__tests__/integration/features/auth/VerificationEmailQueue.integration.test.ts`, against a real
  broker with the worker's handler:
  - the message holds the user id only;
  - the link the worker sends verifies the account;
  - a failed send is retried and leaves one token;
  - exhausted retries park;
  - a redelivered message sends once;
  - a failed publish sends in process;
  - resend queues too.
- Unit tests:
  - `ScheduleEmailVerification.test.ts`;
  - `SendVerificationEmailHandler.test.ts`;
  - `RequestEmailVerification.test.ts` › `executeInTransaction`;
  - `topology.test.ts`;
  - `RabbitMQPublisher.test.ts`.
- `__tests__/unit/architecture.test.ts` › "takes the auth feature from the shared wiring", for
  `server.ts` and `worker.ts`.

## Links

- Code: `src/features/shared/auth/application/use-cases/ScheduleEmailVerification.ts`,
  `…/SendVerificationEmailHandler.ts`, `…/RequestEmailVerification.ts`; `src/composition/auth.ts`;
  `src/shared/infrastructure/queue/topology.ts`; `src/worker.ts`
- Kit: [`durable-verification-email`](../../internal/initiatives/durable-verification-email/README.md)
