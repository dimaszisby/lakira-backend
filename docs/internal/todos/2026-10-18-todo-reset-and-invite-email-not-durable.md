# Todo — the password-reset and invite emails are not retried

- **Status:** Fixed. The password-reset half in #186 (`631108f`,
  [ADR-0069](../../explanation/decisions/adr-0069-the-password-reset-email-is-a-queued-job.md)); the
  invite half on `fix/durable-invite-email`
  ([ADR-0070](../../explanation/decisions/adr-0070-the-invite-email-is-a-queued-job.md)). Register
  row B-70; what a parked invite email leaves is B-71
- **Created:** 2026-10-18
- **Owner:** unassigned
- **Origin:** left out of B-39 by the owner's choice
  ([`durable-verification-email`](../initiatives/durable-verification-email/README.md), ADR-0067),
  which queued the verification email only

## What

Both are sent inside the request, so neither is lost to a crash after the response, as the
verification email was. Neither is retried either:

- **Password reset** (`RequestPasswordReset`, `POST /auth/forgot-password`): a failed send is
  logged and swallowed, and the response still says the instructions were sent. The user waits
  for an email that never comes, and the reset link is valid for 15 minutes only.
- **Invite** (`InviteUserToOrganization`, `POST /organizations/:id/invites`): a failed send
  fails the request, so the inviter sees it and can try again. The invite row is already saved,
  so a second attempt answers 409 until the first expires.

## Suggested fix

The pattern ADR-0067 set: a job carrying ids only, a handler that writes and sends inside
`MessageIdempotencyPort.runOnce`, and an in-process fallback when the publish fails.

- **Password reset:** the job carries the user id. Minting the token in the worker keeps the
  15-minute link fresh on a late retry.
- **Invite:** the job carries the invite id. The send moves out of the request, so the inviter no
  longer sees a send failure. That changes the API's behaviour, and the frontend should hear of it
  first.

Each is its own change; the invite one changes an interface.
