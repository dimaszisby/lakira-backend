# ADR-0099 — An email change waits for the new address to confirm it

- **Status:** Accepted
- **Date:** 2026-11-25
- **Related:** issue #309 (finding Y7 of the dated run of 2026-11-14, #299); issue #351 (a reset
  token spent twice); follows [ADR-0098](./adr-0098-credential-changes-ask-for-the-current-password.md)
  (the routes and the proof); its jobs follow [ADR-0067](./adr-0067-the-verification-email-is-a-queued-job.md),
  [ADR-0069](./adr-0069-the-password-reset-email-is-a-queued-job.md) and
  [ADR-0080](./adr-0080-the-queue-fails-over-to-the-process.md)
- **Origin:** `D-02` of the [`credential-changes`](../../internal/initiatives/credential-changes/decisions.md)
  kit, with D-05 (the two jobs), D-06 and D-10 (the limits and numbers), D-07 (the link setting),
  D-09 (a password change cancels it) and D-11 (writes that race it); the owner chose D-02 on
  2026-11-24, and D-09 to D-11 with the plan and review of 2026-11-25

---

## Context

`AuthUser.changeEmail` changed the address at once and left `emailVerifiedAt` set, and no message
went to either address. A mistyped address took over password recovery, an attacker holding a
session and the password could move the account without its owner hearing of it, and a
verification link sent to an earlier address could mark a later one verified. ADR-0098 took the
email off `PUT /auth/profile`; this record decides how it changes instead.

## Decision

1. **`POST /auth/change-email { currentPassword, email }` stores a pending change, and the
   account's email does not move.** It asks for the current password through
   `ConfirmCurrentPassword` and shares the per-user count of wrong ones with
   `POST /auth/change-password`. The same address is a 400 on `email`, one another account holds is
   a 409, and otherwise the answer is 202. The pending row, in `email_change_tokens`, keeps the new
   address, the old one, an expiry 24 hours out set at the request, and a token stored only as its
   SHA-256 hash. One pending change per user, enforced by a partial unique index: a new request
   supersedes the earlier one, and the loser of two racing requests answers 409.
2. **Two emails, each its own queued job, carrying ids only.** The confirmation link goes to the
   new address: the job mints the token and stores its hash inside `runOnce`, and its fallback
   runs in the request, as the reset email's does. A notice goes to the old address, read from the
   row, naming the new one masked (`n•••@example.com`); its fallback runs after the response, as
   the verification email's does. Neither carries text the user chose beyond the address.
3. **`POST /auth/confirm-email-change { token }` applies it, with no session needed.** The token is
   spent by one conditional update (unused and unexpired), so of two racing confirmations one
   changes the email and the other gets the same generic 400 as an unknown, spent, replaced or
   expired token. In the same transaction the address is re-checked (409, nothing changes), the
   email changes and is marked verified, and the user's other pending changes, unused verification
   links and unused reset links are spent. Sessions are not ended.
4. **A password change or reset cancels a pending email change,** as the first statement of its
   transaction, and sends "your password was changed" to the account's address after it commits.
   The old-address notice can then tell its owner something that works: change the password.
5. **Writes that race a confirmation cannot undo it.** `AuthUser` records which fields its methods
   changed, and `UserRepository.save` writes only those, so a use case that read the user before a
   confirmation and saves after it does not write the old email back. A reset token is spent by a
   conditional update as the last statement of the reset, so a link the confirmation revoked, or a
   second reset racing the first, sets no password (#351).
6. **Lock order.** A confirmation, a password change and a reset all take `email_change_tokens`
   rows before the user's, and reset tokens after it, so none of them can deadlock another.
7. **`FRONTEND_EMAIL_CHANGE_URL`** is the page the link opens. Production refuses a loopback host
   at startup; staging starts and warns. `RATE_LIMIT_EMAIL_CHANGE_USER_MAX` (default 5 per user per
   hour) bounds the requests, since each mails an address the caller names; the confirmation goes
   through the verify-email route's per-IP limiter.

## Options considered

- **Change at once and mark the address unverified, sending a verification.** No new table, but a
  mistyped address takes over recovery until fixed, and once #311 gates inviting on a verified
  address every email change would block inviting until verified.
- **Bind verification tokens to an address instead.** Fixes only the leftover-link hole, not the
  typo, and tells the old address nothing.
- **One job sending both emails.** A failed second send would retry the first, minting a new link
  and killing the one already sent.
- **Mint the token in the request.** The raw token would then travel to the worker in the message.
- **Targeted writes per use case** (`setPasswordHash(id, hash)` and the like) instead of recording
  changed fields. The same effect, with a repository method per field, and every new use case free
  to forget it.
- **Spend the reset token first in its transaction.** Locks reset tokens ahead of the user row, the
  opposite of a confirmation; the two could deadlock.
- **End every session on a confirmation.** Would take away the owner's way back when someone who
  holds the session and the password confirms within seconds: a session still open is where the
  owner can change the password and the email back.

## Consequences

- A migration (`20261125000001-create-email-change-tokens`), a model, a repository, two queues, two
  consumers, three templates and two settings; production must set `FRONTEND_EMAIL_CHANGE_URL`
  before this reaches it.
- The frontend needs a settings form and a page at `FRONTEND_EMAIL_CHANGE_URL` that posts the
  token.
- Whoever holds the session, the password and the new inbox can still move the account; the
  owner hears of it at the old address and recovers from a session that is still open. An undo
  link in the notice is #352.
- `UserRepository.save` issues a narrower `UPDATE`, and writes nothing when nothing changed.
- An access token issued before a confirmation carries the old address in its `email` claim until
  it expires; `authMiddleware` reloads the user, so nothing reads it.

## Links

- Kit: `docs/internal/initiatives/credential-changes/` (plan AC-6 to AC-14; D-02, D-05 to D-07,
  D-09 to D-11)
- `src/features/shared/auth/application/use-cases/RequestEmailChange.ts`, `ConfirmEmailChange.ts`,
  `ScheduleAccountNotice.ts`, `SendAccountNotice.ts`
- `src/features/shared/auth/infrastructure/persistence/EmailChangeTokenRepositorySequelize.ts`
- `__tests__/integration/api/auth-credential-changes.test.ts`, `auth-password-reset.test.ts`,
  `__tests__/integration/features/auth/fallback-sends-once.integration.test.ts`,
  `email-jobs-concurrency.integration.test.ts`
