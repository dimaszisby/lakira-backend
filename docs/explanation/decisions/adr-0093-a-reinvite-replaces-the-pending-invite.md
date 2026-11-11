# ADR-0093 — A re-invite replaces the pending invite

- **Status:** Accepted
- **Date:** 2026-11-10
- **Related:** issue #249 (register row B-71); [ADR-0070](./adr-0070-the-invite-email-is-a-queued-job.md),
  the queued invite email, whose kit `durable-invite-email` D-04 accepted the gap this closes; kit
  `pending-invite-uniqueness` D-01, the unique index on pending invites; the frontend's O-14
- **Origin:** issue #249; the remedy chosen by the frontend's owner on 2026-10-23 (Notion "FE and
  BE messages", Part 2, "The invite email is queued…")

---

## Context

`POST /organizations/{id}/invites` answered 409 when the address already had a pending invite.
With the queue on, an invite whose email job parked, or was never published, left a pending invite
nobody received, and the address could not be invited again until it expired, 7 days later. An
email that was sent but lost hit the same 409 with the queue on or off. Kit `durable-invite-email`
accepted that until the frontend chose a remedy (D-04). The frontend chose this one over a resend
endpoint, which would keep the 409 and need a list of pending invites and a screen for it.

## Decision

- **Inviting an address with a pending invite replaces it.** The use case deletes every unaccepted
  invite for the address, expired or not and in any case (as the unique index matches), and saves
  the new one, in one transaction. The new invite has a new token and expiry, the email is sent
  again, the earlier link no longer accepts, and the newer role applies. The answer is 201.
- **With the queue off,** the send joins that transaction. A failed send rolls the replacement
  back, so the earlier invite and its link stay as they were, and the request answers 500.
- **With the queue on,** the replacement commits before the job is published. A job still queued
  or parked for the earlier invite finds no invite and sends nothing.
- **409 remains only for a race.** Two invites for one address at once leave one invite: the second
  loses at the unique index (409) if the first has not committed, or replaces it if it has.
- The OpenAPI description of the route says so. Its status codes and bodies do not change.

## Options considered

- **A resend endpoint for one pending invite:** keeps the 409, and needs a way to list pending
  invites that the API does not have. The frontend set it aside.
- **Update the pending invite in place, keeping its id:** a queued job for that id would then send
  the earlier request's email with the newer role. Deleting it makes the earlier job a no-op.

## Consequences

- An inviter can always send an invite again; a lost or parked email no longer blocks the address
  for 7 days.
- An invitee holding an earlier link finds it refused once a newer invite is sent.
- With the queue on, if the publish and the fallback send both fail, the new invite is deleted and
  the earlier one is already gone; the retry answers 201.
- The frontend changes its copy to "Invitation sent. If it doesn't arrive, send it again." and
  re-syncs the spec for the new description.
