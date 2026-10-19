# Durable invite email — Plan

- **Status:** Done
- **Appetite:** 1 day — past that, cut the publish-failure compensation's integration case, never
  the guarantees
- **Date:** 2026-10-19

## Context and goals

Register row B-70, its invite half, from
`docs/internal/todos/2026-10-18-todo-reset-and-invite-email-not-durable.md`.
`POST /organizations/:id/invites` runs `InviteUserToOrganization`, which saves the invite row and
then sends the email inside the request. A failed send fails the request, but the row is already
saved, so a retry answers 409 until the invite expires seven days later: the inviter is stuck.

ADR-0067 and ADR-0069 fixed the same defect for the verification and password-reset emails. When
this lands, with `RABBITMQ_ENABLED=true` the invite email is a job on the queue: the worker mints
the token and sends it, a failed send is retried with backoff and finally parked, and a redelivery
sends nothing twice. With the queue off, the row and the send share one transaction, so a failed
send leaves nothing behind and a retry succeeds.

This changes behaviour the frontend sees: with the queue on, 201 means the email was queued, and a
failed send no longer fails the request. Status codes, bodies and the OpenAPI spec do not change.

## Acceptance criteria

- **AC-1** — With the queue on, a valid invite answers 201, publishes one message on
  `auth.send-invite-email` whose body is `{inviteId}` and nothing else, and sends nothing in the
  request.
  _Why:_ the todo's ask; an address or token must not ride the broker (security rules).
- **AC-2** — The email the worker sends carries a link that `POST /invites/accept` accepts.
  _Why:_ an email that is queued but cannot be accepted proves nothing.
- **AC-3** — A send that fails in the worker is retried, and the invite ends with one token hash,
  the one emailed; past `RABBITMQ_MAX_RETRIES` the message parks.
  _Why:_ the failed send is the defect.
- **AC-4** — The same messageId delivered twice sends one email; a malformed message parks at
  once; an invite that is gone, accepted or expired is sent nothing.
  _Why:_ RabbitMQ delivers at least once (ADR-0007); a body no retry can fix must not loop.
- **AC-5** — With the queue off, a failed send fails the request, leaves no invite row, and the
  same invite then answers 201, not 409.
  _Why:_ the 409 trap is the todo's second complaint, and every deployed environment runs with the
  queue off.
- **AC-6** — With the queue on and a publish that throws, the email is sent in the request; if that
  send fails too, no invite row is left.
  _Why:_ durability may fall back, never below today (durable-verification-email D-04).
- **AC-7** — The existing invite integration tests pass unchanged, and OpenAPI shows no drift.
  _Why:_ the frontend depends on the codes and the body.

## Open questions

None. D-04 records what is accepted for a parked invite email, and the remedy is filed for the
frontend to weigh.

## Out of scope

- Re-inviting to replace a pending invite, or a resend endpoint: both change the API (D-04).
- A shared schedule-or-fallback helper across the three emails.
- Any change to an HTTP status, body or message.

## Decisions expected

- What the message carries (D-01).
- Where the token is minted, given only its hash is stored (D-02).
- What happens with the queue off or a failed publish (D-03).
- What a parked invite email leaves behind (D-04).

## Phases

### Phase 0 — kit and branch

### Phase 1 — the auth feature

Repository methods taking a transaction; `InviteUserToOrganization` publishes or sends inside a
transaction, and gains `executeInTransaction`; `SendInviteEmailHandler`.

### Phase 2 — plumbing and wiring

A routing key and a queue declared through `assertWorkQueue`; `feature.ts` passes the queue and
the transaction port; `src/worker.ts` consumes the queue.

### Phase 3 — proof

Unit tests; an integration test against a real broker, modelled on the password-reset one; the
queue-off rollback case beside the existing invite tests.

## Risks and trade-offs

- With `RABBITMQ_ENABLED=true` and no worker, invite emails wait unsent, as the other two emails
  already do. No deployed environment runs the worker yet.
- A parked invite email blocks re-inviting that address until the invite expires (D-04).

## Rollback

Code only: revert the PR. No migration. Jobs left on the queue after a revert are not consumed.

## Security and data

The message carries the invite id only: no address, no token. The token is minted where it is
sent, and only its hash is stored. Log lines name the invite by id.

## References

- ADR-0067, ADR-0069 and their kits; ADR-0005 (retry and parking); ADR-0007 (idempotent consumers)
- `pending-invite-uniqueness` kit (the 409 and its index)
