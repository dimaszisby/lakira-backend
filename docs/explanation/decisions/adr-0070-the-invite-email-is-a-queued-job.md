# ADR-0070 — The invite email is a queued job

- **Status:** Accepted (merged in #187, `f6ec4a5`)
- **Date:** 2026-10-19
- **Related:** [ADR-0067](./adr-0067-the-verification-email-is-a-queued-job.md) and
  [ADR-0069](./adr-0069-the-password-reset-email-is-a-queued-job.md) (the same pattern, for the
  other two emails); [ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md) (retries and
  parking); [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md) (idempotency);
  [ADR-0040](./adr-0040-worker-process-deployment-topology.md) (the worker has no deployment);
  [ADR-0056](./adr-0056-one-wiring-per-feature-for-every-entry-point.md) (one wiring)
- **Origin:** `D-01` to `D-04` in the durable-invite-email kit —
  [`durable-invite-email`](../../internal/initiatives/durable-invite-email/decisions.md); register
  row B-70 ([todo](../../internal/todos/2026-10-18-todo-reset-and-invite-email-not-durable.md))

> **Status note (2026-10-23).** `installAuthFeature` and `installOrgFeature`, named at the end of
> § Decision, no longer exist: since
> [ADR-0072](./adr-0072-features-are-handed-to-their-routers.md), `buildWiredFeatures`
> (`src/composition/features.ts`) builds one auth feature with the server's publisher, and
> `src/app.ts` hands it to the auth, organization, invite and membership routers. The invite route
> still publishes with the server's publisher (audit 2026-10-20, X46).

---

## Context

`POST /organizations/:id/invites` ran `InviteUserToOrganization`, which saved the invite and then
sent the email inside the request. A failed send failed the request, but the invite was already
saved, so inviting the same address again answered 409 until the invite expired, seven days
later. The organization controller also built its own copy of the auth feature, without the
server's publisher.

## Decision

1. **The message carries the invite id only.** The job is `{ inviteId }` on
   `auth.send-invite-email`. The worker loads the invite and its organization. No address and no
   token reach the broker.
2. **The token is minted where the email is sent.** Only the token's hash is stored, so a link
   cannot be rebuilt from the row. The request saves the invite with the hash of a token nobody
   sees; whoever sends the email mints a fresh token and replaces the hash. The worker does both
   inside the transaction `MessageIdempotencyPort.runOnce` opens: a failed send throws, the dedup
   record rolls back, and the consumer retries and finally parks. An invite that is gone, accepted
   or expired is sent nothing. `SendInviteEmailHandler` parks a malformed body at once.
3. **With the queue off, the invite and the send share one transaction.** A failed send rolls the
   invite back and fails the request as before, and the retry succeeds. When a publish throws, the
   request mints and sends inside a transaction; if that send fails too, it deletes the invite and
   rethrows.
4. **A parked invite email is accepted, and its remedy is the frontend's call.** With the queue on,
   201 means the email was queued. An email that parks leaves a pending invite nobody received,
   and re-inviting answers 409 until it expires. The remedy, re-inviting to replace a pending
   invite or a resend endpoint, changes the API and is register row B-71.

`src/server.ts` installs one wired auth feature into both auth controllers
(`installAuthFeature`, `installOrgFeature`), so the invite route publishes with the server's
publisher. The queue is declared through `assertWorkQueue` in
`src/shared/infrastructure/queue/topology.ts`, and `src/worker.ts` consumes it with the handler
from `buildWiredAuthFeature`.

## Options considered

- **Carry the address, or the raw token.** An address or a secret persisted on the broker.
- **A nullable token hash until the worker runs.** A migration for a value that is only briefly
  absent.
- **Keep the request path as it was, as ADR-0069 did for the reset.** It leaves the 409 after a
  failed send on every environment that runs with the queue off, which is every deployed one.
- **Fail the request on a failed publish.** A broker outage would stop invites that could have
  been sent.
- **Delete the invite when its job parks.** The consumer has no hook at parking, and a handler
  cannot tell which attempt is its last.

## Consequences

- With `RABBITMQ_ENABLED=true` a failed invite email is retried and parked instead of failing the
  request; the inviter no longer sees a send failure. Status codes and bodies do not change.
- With the queue off, a failed send still fails the request, but the retry now succeeds. The
  request holds a transaction open for the length of one send.
- With the queue on and no worker, invite emails wait unsent, as the other two emails do. No
  deployed environment runs the worker yet (ADR-0040).
- With the queue on, a parked email or a crash between the save and the publish leaves an invite
  that nobody can accept and that blocks re-inviting until it expires (B-71).
- A crash between the send and the commit sends the email twice; the second link replaces the
  first, so only the later email works.
- The worker needs `FRONTEND_INVITE_URL` and `INVITE_TOKEN_TTL_DAYS`.

## Enforcement

- `__tests__/integration/features/auth/InviteEmailQueue.integration.test.ts`, against a real
  broker: the queued body is `{ inviteId }`; the worker's link is accepted; a failed send is
  retried and the stored hash is the emailed token's; a job that always fails parks; a duplicate
  sends once; an accepted invite is sent nothing; a failed publish sends in the request, and a
  failed publish and send leave no invite. It fails when the hash is never replaced, and when the
  invite is not deleted after both fail.
- `__tests__/integration/api/organization-membership.test.ts` › "leaves no invite when the send
  fails, so a retry succeeds" (queue off). It fails when the invite is saved outside the
  transaction.
- `__tests__/unit/features/auth/application/InviteUserToOrganization.test.ts` and
  `SendInviteEmailHandler.test.ts`; `topology.test.ts` declares the queue.

## Links

- Kit: [`durable-invite-email`](../../internal/initiatives/durable-invite-email/README.md)
