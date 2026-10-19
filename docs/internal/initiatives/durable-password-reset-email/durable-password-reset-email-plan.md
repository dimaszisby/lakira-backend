# Durable password-reset email — Plan

- **Status:** Done
- **Appetite:** 1 day — past that, cut the integration retry case, never the guarantees
- **Date:** 2026-10-19

## Context and goals

Register row B-70, from `docs/internal/todos/2026-10-18-todo-reset-and-invite-email-not-durable.md`.
`POST /auth/forgot-password` runs `RequestPasswordReset`, which mints a 15-minute token and sends
the email inside the request. A failed send is logged and swallowed, and the response still says
the instructions were sent: the user waits for an email that never comes.

B-39 (#184, ADR-0067) fixed the same defect for the verification email. When this lands, with
`RABBITMQ_ENABLED=true` the reset email is a job on the queue: the worker mints the token and sends
it, a failed send is retried with backoff and finally parked, and a redelivery sends nothing
twice. With the queue off, or when publishing fails, the email is sent in the request exactly as
today.

## Acceptance criteria

- **AC-1** — With the queue on, `POST /auth/forgot-password` for a known address publishes one
  message on `auth.send-password-reset-email` whose body is `{userId}` and nothing else, and sends
  nothing in the request; for an unknown address it publishes nothing.
  _Why:_ the todo's ask; and an address or token must not ride the broker (security rules).
- **AC-2** — The handler the worker runs sends one email whose link resets the password.
  _Why:_ an email that is queued but cannot reset proves nothing.
- **AC-3** — A send that fails is retried, and one email is sent when a retry succeeds; past
  `RABBITMQ_MAX_RETRIES` the message parks.
  _Why:_ "a failed send is logged and swallowed" is the defect.
- **AC-4** — The same messageId delivered twice sends one email; a malformed message parks at
  once.
  _Why:_ RabbitMQ delivers at least once (ADR-0007); a body no retry can fix must not loop.
- **AC-5** — When the publish throws, or the queue is off, the email is sent in the request as
  today and the response is unchanged.
  _Why:_ durability may fall back to today's, never below it (durable-verification-email D-04).
- **AC-6** — No response changes: the existing password-reset integration tests pass untouched,
  and OpenAPI shows no drift.
  _Why:_ the response must not reveal whether an account exists, and the frontend depends on it.

## Open questions

None. The scope (reset only; the invite changes what the inviter sees) follows the todo, and the
fallback follows the owner's choice for B-39.

## Out of scope

- The invite email: B-70's remainder. Moving it out of the request changes an interface.
- A shared schedule-or-fallback helper: two cases do not yet justify one.
- Any change to an HTTP response.

## Decisions expected

- What the message carries, and where the lookup runs (D-01).
- Where the send sits against the idempotency transaction (D-02).
- Whether a late retry needs a staleness check (D-03).
- What happens with the queue off or a failed publish (D-04).

## Phases

### Phase 0 — kit and branch

### Phase 1 — the auth feature

An optional transaction on the two reset-token repository calls the job makes;
`RequestPasswordReset` publishes or falls back, and gains `executeInTransaction`, which throws on a
failed send; `SendPasswordResetEmailHandler`.

### Phase 2 — plumbing and wiring

A routing key and a queue declared through `assertWorkQueue`; `feature.ts` passes the queue to
the use case; `src/worker.ts` consumes the queue.

### Phase 3 — proof

Unit tests; an integration test against a real broker, modelled on the verification one.

## Risks and trade-offs

- With `RABBITMQ_ENABLED=true` and no worker, reset emails wait unsent, as verification emails
  already do (ADR-0067). No deployed environment runs the worker yet.

## Rollback

Code only: revert the PR. No migration. Jobs left on the queue after a revert are not consumed.

## Security and data

The message carries the user id only: no address, no token. The lookup by address stays in the
request, so the response is the same whether the account exists or not. Log lines name the user
by id.

## References

- ADR-0067 and the `durable-verification-email` kit; ADR-0005 (retry and parking); ADR-0007
  (idempotent consumers)
