# Credential changes — Decisions

Kit-local decisions for #309. Each was settled by the owner on 2026-11-24, in the plan, so each is
written Accepted (ADR-0085). D-01 and D-02 are promoted to the registry in the pull request that
builds them.

## D-01 — Credential changes have their own routes and ask for the current password

- **Status:** Accepted
- **Date:** 2026-11-24

Promoted to the architecture decision registry as **[ADR-0098](../../../explanation/decisions/adr-0098-credential-changes-ask-for-the-current-password.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — An email change is pending until the new address confirms it; the old address is told

- **Status:** Accepted
- **Date:** 2026-11-24

Promoted to the architecture decision registry as **[ADR-0099](../../../explanation/decisions/adr-0099-an-email-change-waits-for-the-new-address.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — ADR-0018 stands; #309's gating expectation moves to #311

- **Status:** Accepted
- **Date:** 2026-11-24

**Context.** #309 expects "the routes that need a verified address are guarded by
`requireVerifiedEmail`". ADR-0018 (Accepted) decided this template gates no route on verification.
**Decision.** Keep ADR-0018 in #309. #311 already asks that inviting need a verified address, the
one route where an unverified account reaches other people; the gate, and the record that narrows
ADR-0018, go there. A comment on #309 says so.
**Options considered.** _Gate inviting in #309:_ the same change, filed under the wrong finding.
_Gate every route outside auth:_ a product change with frontend impact; ADR-0043 argued against a
verification wall.
**Consequences.** #309 closes without touching any guard.

## D-04 — The guess counter is per user, apart from the login lockout

- **Status:** Accepted (amended 2026-11-24 after Phase 1's review: attempts are reserved before
  they are judged)
- **Date:** 2026-11-24

**Context.** With a current-password check, a script riding a session could still guess at
`userRateLimiter`'s 50 requests per 15 minutes. `loginLockout.ts` counts failures, but its key,
threshold and message are fixed to login and to an email address.
**Decision.** `loginLockout.ts` is rebuilt on a small factory, `makeAttemptCounter` in
`attemptCounter.ts`, over the same `LockoutRedisClient`; login's counter is unchanged
(`auth:lockout:<hashEmail>`). The credential counter is `auth:credential-attempts:<userId>`, with
login's numbers: 5 in 15 minutes. **Each attempt is reserved before it is judged**: the controller
increments the count first, and past the threshold answers 429 with `Retry-After` without comparing
any password; `ConfirmCurrentPassword` clears the count when the password is right, and a wrong one
stays counted. It fails open when Redis is down, as the lockout does.
**Options considered.** _Count into the login lockout:_ one budget, but a typo in settings would
block signing in. _Check, then count the failure after the comparison (login's shape):_ the first
build did this, and Phase 1's review showed that parallel wrong guesses all read the same count, so
up to `userRateLimiter`'s 50 were judged, not 5; a test now fires 10 at once and sees 5 judged.
_Rely on `userRateLimiter`:_ 50 guesses per 15 minutes is too many.
**Consequences.** When Redis is down the counter lets requests through, and only `userRateLimiter`
bounds guesses (in memory, per instance, under `REDIS_REQUIRED=false`): accepted, as for login
(TF-12), and logged as `auth.credentials.redis_unavailable`. Whoever holds a stolen access token can
spend the 5 attempts and block the owner's password change for 15 minutes; the owner's recovery,
forgot-password, is not counted. Login's lockout keeps the check-then-count shape, with the same
parallel gap, which predates this kit; it is noted for #349's race-condition control.

## D-05 — Two new email jobs

- **Status:** Accepted
- **Date:** 2026-11-24

**Context.** A job's message carries ids only, never an address or a token (`architecture.md`).
The confirmation link carries a raw token, and the notice must reach the old address.
**Decision.** `AUTH_SEND_EMAIL_CHANGE_EMAIL`, as the reset email (ADR-0069): the message carries the
pending row's id; the job mints the token, stores its hash on the row and sends to the new address,
inside `runOnce`; the fallback runs in the request, under the ADR-0080 rule. `AUTH_SEND_ACCOUNT_NOTICE`,
as the verification email (ADR-0067): `{ userId, notice, requestId? }`, with `notice` one of
`email_change_requested` (sent to the row's old address) and `password_changed` (sent to the
account's address); the fallback runs after the response.
**Options considered.** _One job sending both emails:_ a failed second send retries the first, minting
a new link and killing the one already sent. _Mint the token in the request:_ the raw token would
then have to travel to the worker.
**Consequences.** Two queues, two consumers, two handlers, and their places in `job-routes.ts`,
`topology.ts`, `worker.ts` and the queue suites.

## D-06 — Limits on the new routes

- **Status:** Accepted
- **Date:** 2026-11-24

**Context.** `POST /auth/change-email` sends mail to an address the caller names, the vector #311
describes for invites. `POST /auth/confirm-email-change` takes an emailed token without a session.
**Decision.** Change-email requests get a per-user limiter of their own,
`RATE_LIMIT_EMAIL_CHANGE_USER_MAX`, after `authMiddleware`. The confirm route goes through the
verify-email route's per-IP limiter, first in its chain, as `/verify-email` does: both submit an
emailed token. `POST /auth/change-password` keeps `userRateLimiter`; D-04's counter bounds guesses.
**Options considered.** _`userRateLimiter` alone for change-email:_ 50 emails per 15 minutes to any
addresses. _A new per-IP limiter for the confirm route:_ another setting, for the same kind of
request the verify-email limiter already covers.
**Consequences.** One new limiter and setting, and the lists every limiter must join.

## D-07 — `FRONTEND_EMAIL_CHANGE_URL`: production refuses its localhost default; staging warns

- **Status:** Accepted
- **Date:** 2026-11-24

**Context.** The three existing `FRONTEND_*_URL` settings default to `http://localhost:3000/...`
and no environment refuses the default, so a deploy that forgets one mails links nobody can open.
**Decision.** The new setting is read like the others. Production refuses its localhost default at
startup; staging logs a warning, as staging does for an unverified database certificate
(ADR-0036).
**Options considered.** _Refuse in staging too:_ a staging deploy that has not set it would stop.
_Refuse the three existing settings in the same change:_ the same risk on staging, and a separate
finding; it stays its own issue.
**Consequences.** Production must have the setting before PR 2 reaches it.

## D-08 — A `ValidationError` can name the field it refuses

- **Status:** Accepted — found while planning Phase 1, approved with that plan
- **Date:** 2026-11-24

**Context.** AC-2 answers a wrong current password with a 400 on the current-password field. A
`ValidationError` carried only a message, so the envelope had no `errors` entry, and a client could
not tell which field to mark.
**Decision.** `ValidationError` takes an optional `{ field }`. `errorHandler` answers one that has a
field as it answers a Zod failure: `VALIDATION_FAILED_MESSAGE`, with
`errors: [{ field, message }]`, the field named as the auth routes name a body field
(`currentPassword`, as register names `passwordConfirmation`). Every existing `ValidationError` is unchanged.
**Options considered.** _Throw a `ZodError` from the use case:_ the application layer may import no
third-party package. _Message only:_ the client would have to guess the field from the text.
**Consequences.** A small, additive change in the shared kernel, and one test in the error handler's.

## D-09 — A password change or reset cancels a pending email change

- **Status:** Accepted — found while planning Phase 2, approved with that plan
- **Date:** 2026-11-25

**Context.** The notice to the old address tells its owner to change their password if they did
not ask for the change. A pending change survived a password change, so following that advice left
the link in the new inbox working: whoever had the current password could still move the account.
**Decision.** `ChangePassword` and `ResetPassword` supersede the user's pending
`email_change_tokens` rows in the transaction that writes the new hash, as the first statement.
Both those paths and `ConfirmEmailChange` then lock `email_change_tokens` ahead of `users`, so a
reset racing a confirmation cannot deadlock; ADR-0097's order (refresh tokens before the user row)
follows.
**Options considered.** _Leave pending changes alone:_ the notice's advice would not stop the
change, and only the undo link of #352 would. _End the pending change only on a reset:_ a change
made from a session the owner still holds is the same signal.
**Consequences.** One more statement in both transactions, and a sentence in the notice saying a
password change cancels the request.

## D-10 — The numbers D-02, D-06 and D-07 left open

- **Status:** Accepted — found while planning Phase 2, approved with that plan
- **Date:** 2026-11-25

**Context.** D-02 named no lifetime for the confirmation link, D-06 no window or default for the
change-email limiter, and D-07 not how "the localhost default" is recognised.
**Decision.** The link lives 24 hours, as a verification link does, since both prove control of an
inbox; it is a constant, `EMAIL_CHANGE_TOKEN_TTL_HOURS`, and `expires_at` is set when the request
is made, so a slow job cannot extend it. The limiter allows `RATE_LIMIT_EMAIL_CHANGE_USER_MAX`
requests (default 5) per user per hour. Production refuses `FRONTEND_EMAIL_CHANGE_URL` when its
host is a loopback name or address (`localhost`, `127.0.0.1`, `::1`), not only the literal default.
**Options considered.** _15 minutes, as a reset link:_ a reset link replaces a password, and the
new inbox may be one the user opens later. _A setting for the lifetime:_ one more variable for a
number no deploy has asked to change. _Refuse only the literal default:_ `http://localhost:3001/...`
would pass.
**Consequences.** The image smoke, which runs as production, passes a real-looking URL.

## D-11 — Writes that race an email change cannot undo it

- **Status:** Accepted — found in Phase 2's review (the `security-reviewer` agent, M1 and L1)
- **Date:** 2026-11-25

**Context.** `UserRepositorySequelize.save` wrote every field of the entity it was given. A password
change, a reset, a verification or a profile edit read the user before a confirmation committed and
saved after it, so it wrote the old email back: the confirmation answered 200 and the account was
silently on the old address again. A reset token checked before a confirmation still set the
password after it, because `markUsed` spent the token unconditionally (#351). Two change requests
at the same moment each superseded nothing the other had committed, so both links worked.
**Decision.** Three parts.

1. `AuthUser` records which fields its methods changed, and `save` writes only those, so each use
   case writes what it decided and nothing it merely read.
2. A reset token is spent with one conditional update (`used_at IS NULL AND expires_at > now`),
   the last statement of the reset's transaction; when it spends nothing the reset rolls back with
   the generic 400. Last, not first: first would lock reset tokens ahead of `users`, the opposite of
   a confirmation, and the two could deadlock. This is #351's fix.
3. A partial unique index allows one pending change per user (`user_id WHERE used_at IS NULL`); the
   loser of two racing requests answers 409, and a confirmation also supersedes any other pending
   row of the user.
   **Options considered.** _Targeted writes per use case (`setPasswordHash(id, hash)`):_ the same
   effect, with a repository method per field and every new use case free to forget it. _Lock the
   user row first everywhere:_ inverts the order the confirmation takes. _Leave #351 to its own
   branch:_ the confirmation's guarantee needs the same line.
   **Consequences.** `save` issues a narrower `UPDATE`; a use case that changes nothing writes
   nothing. The migration gains an index. #351 closes with this pull request.
