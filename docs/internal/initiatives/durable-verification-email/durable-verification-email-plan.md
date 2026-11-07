# Durable verification email — Plan

- **Status:** Done (merged in #184, `975de82`)
- **Appetite:** 1.5 days — past that, cut the integration retry case, never the guarantees
- **Date:** 2026-10-18

## Context and goals

Register row B-39, from `docs/internal/todos/2026-10-02-todo-durable-email-delivery.md`. The
verification email in `register` and `resendVerification` is sent after the response through
`runInBackground` (ADR-0054). The work exists only in memory: a crash, a SIGKILL or a drain timeout
loses it, and `RequestEmailVerification` logs a failed send and never retries it. The user then has
to ask again.

When this lands, with `RABBITMQ_ENABLED=true` the email is a job on the queue: the worker sends it,
a failed send is retried with backoff and finally parked, and a redelivery sends nothing twice.
With the queue off, or when publishing fails, the email is sent in process exactly as today.

## Acceptance criteria

- **AC-1** — With the queue on, `POST /auth/register` publishes one message on
  `auth.send-verification-email` whose body is `{userId}` and nothing else; the handler the worker
  runs sends one email whose link verifies the account.
  _Why:_ the todo's ask; an email that is queued but cannot verify proves nothing.
- **AC-2** — A send that fails is retried, and one email is sent when a retry succeeds; past
  `RABBITMQ_MAX_RETRIES` the message parks.
  _Why:_ "a failed send is logged and never retried" is the defect.
- **AC-3** — The same messageId delivered twice sends one email.
  _Why:_ RabbitMQ delivers at least once; ADR-0007.
- **AC-4** — When the publish throws or times out, the email is sent in process and the response
  is unchanged.
  _Why:_ the owner's choice: durability may fall back to today's, never below it, and register
  must not fail after the account is committed.
- **AC-5** — With the queue off, behaviour is unchanged; the existing register, resend and verify
  tests pass untouched.
  _Why:_ development, the tests and staging run with the queue off.
- **AC-6** — The message holds no email address and no token; log lines name the user by id.
  _Why:_ `.claude/rules/security.md` § Sensitive Data Handling; a broker persists messages to disk.
- **AC-7** — `server.ts` and `worker.ts` take the auth feature from `buildWiredAuthFeature`, the
  worker imports no feature internals, and the lint boundaries hold.
  _Why:_ ADR-0056, one wiring for every entry point.

## Open questions

None. The owner chose the scope (verification only) and the publish-failure behaviour (fall back
in process) on 2026-10-18.

## Out of scope

- Password reset and invite emails. They are sent inside the request; filed as a register row.
- An outbox table.
- Cleanup of `processed_messages` (B-41, deliberately not built), to which this queue adds rows.
- Staging's RabbitMQ credentials.
- Any change to an HTTP response.

## Decisions expected

- Worker job or outbox (D-01).
- What the message carries (D-02).
- Where the send sits against the idempotency transaction (D-03).
- What happens when publishing fails, and how long a publish may wait (D-04).

## Phases

### Phase 0 — kit and branch

Branch, this kit, D-01 to D-04.

### Phase 1 — queue plumbing

A routing key and a queue with its retry queue, declared through one helper so the two work queues
cannot drift; a publish timeout on `RabbitMQPublisher`.

### Phase 2 — the auth feature

An optional transaction on the two token-repository calls the job makes;
`RequestEmailVerification.executeInTransaction`, which throws on a failed send;
`SendVerificationEmailHandler`; `ScheduleEmailVerification`, which publishes or falls back.

### Phase 3 — wiring

`buildAuthFeature` overrides for the queue and the idempotency guard; `src/composition/auth.ts`;
`installAuthFeature`; one shared publisher in `server.ts`; a consumer in `worker.ts`; the
architecture test.

### Phase 4 — proof

Unit tests for each new piece; an integration test against the real broker for AC-1 to AC-4; a
manual run of the server and worker from source against the Compose broker and
Mailpit.

## Risks and trade-offs

- At least once: a send that succeeds and a commit that then fails sends the email twice (D-03).
- With `RABBITMQ_ENABLED=true` and no worker running, verification emails wait in the queue.
- With an unreachable broker, register and resend wait for the publish timeout before falling back.

## Rollback

Code only: revert the PR. No migration and no stored shape changes. Messages left in the new queue
have no consumer after a revert and wait; let the worker drain it first where the queue is on.

## Security and data

The message carries a user id only. The worker reads the address from the database and mints the
token, so neither enters the broker. Log lines name the user by id.

## Observability

A failed publish logs a warning with the user id and the error before falling back. The consumer
already logs each retry and each park; a parked message sits in `${prefix}.jobs.parking.queue`.

## References

- ADR-0054 (post-response work), ADR-0005 (retries and parking), ADR-0007 (idempotency), ADR-0056
  (one wiring)
- `src/features/public/metric-log/application/use-cases/GenerateDummyMetricLogsHandler.ts`, the
  pattern this follows
