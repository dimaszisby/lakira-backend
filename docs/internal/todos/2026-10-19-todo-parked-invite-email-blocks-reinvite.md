# Todo — an invite whose email never arrived blocks re-inviting

- **Status:** Open. Issue #249 (was register row B-71); waits on the frontend's choice of remedy
- **Created:** 2026-10-19
- **Owner:** unassigned
- **Origin:** [`durable-invite-email` D-04](../initiatives/durable-invite-email/decisions.md)
  ([ADR-0070](../../explanation/decisions/adr-0070-the-invite-email-is-a-queued-job.md))

## What

With `RABBITMQ_ENABLED=true`, `POST /organizations/:id/invites` answers 201 once the invite is
saved and its email queued. Two cases leave a pending invite that nobody received:

- the email job parks, after every retry failed (about a minute with the default settings);
- the server stops between saving the invite and publishing its job.

Either way, inviting the same address again answers 409 ("An invitation is already pending for
this email") until the invite expires, `INVITE_TOKEN_TTL_DAYS` later (7 by default). Nobody can
accept the stuck invite: its stored hash belongs to a token that was never sent.

With the queue off, as on every deployed environment today, this cannot happen: the invite and
the send share one transaction.

## Suggested fix

Both options change what the API does, so the frontend chooses:

1. **Re-inviting replaces a pending invite**: mint a new token, extend the expiry, send again, and
   answer 201 instead of 409. Simple for the inviter; it removes a 409 the frontend may show.
2. **A resend endpoint**, such as `POST /organizations/:id/invites/:inviteId/resend`. It keeps the
   409, but needs a way to list pending invites, which does not exist yet.
