# ADR-0098 — Credential changes have their own routes and ask for the current password

- **Status:** Accepted
- **Date:** 2026-11-24
- **Related:** issue #309 (finding Y7 of the dated run of 2026-11-14, #299); builds on
  [ADR-0097](./adr-0097-a-password-reset-or-change-ends-every-other-session.md) (what a password
  change does to sessions) and [ADR-0032](./adr-0032-account-lockout-redis-sliding-window.md) (the
  login lockout)
- **Origin:** `D-01` of the [`credential-changes`](../../internal/initiatives/credential-changes/decisions.md)
  kit, with D-04 (the guess counter) and D-08 (a refusal that names its field); the owner chose it
  on 2026-11-24

> **Status note (2026-11-25).** `POST /auth/change-email` now exists, with the same proof and the
> same count of wrong passwords; the change it asks for waits for the new address to confirm it
> ([ADR-0099](./adr-0099-an-email-change-waits-for-the-new-address.md)). A password change also
> cancels a pending email change and sends a notice. The decision below is unchanged.

---

## Context

`PUT /auth/profile` changed the password and the email on an access token alone. A leaked
15-minute token, or script injected into the frontend riding the session through its proxy
without ever reading the token, could set a new password, and since ADR-0097 also sign the owner
out of every other device.

## Decision

1. **A password change is `POST /auth/change-password { currentPassword, password,
passwordConfirmation }`.** An email change will be `POST /auth/change-email`, with the same
   proof (the kit's second pull request). `PUT /auth/profile` keeps `username` and
   `isPublicProfile`, and refuses a body carrying `password` or `email` with a 400 on that field:
   left out of the schema, Zod would drop them, and the client would read a 200 for a change that
   never happened.
2. **The proof is the current password, checked in one place,** `ConfirmCurrentPassword`, which
   every credential change calls. A wrong one is a 400 on `currentPassword`, never a 401: the
   frontend's proxy reads a 401 as a dead session and signs the user out. A new password equal to
   the current one is a 400 on `password`.
3. **Wrong guesses are bounded per user, apart from the login lockout.** The edge reserves each
   attempt before it is judged (`auth:credential-attempts:<userId>`); past 5 in 15 minutes the
   route answers 429 with `Retry-After` and compares nothing, and a right password clears the
   count. A typo in settings never blocks signing in. The counter and login's lockout share one
   factory, `makeAttemptCounter`.
4. **A `ValidationError` may name its field,** and the error handler answers it as a schema
   failure does: `Validation failed`, with `errors: [{ field, message }]`.
5. A successful change does what ADR-0097 says: every session ends, the one making the change
   continues on a new refresh cookie, and reset links sent before the change stop working.

## Options considered

- **`currentPassword` on `PUT /auth/profile`.** The smallest change, but every later rule about
  credentials (limits, notices, log lines, effects on sessions) would branch on which fields a
  profile edit happens to carry.
- **Step-up by a recent login.** No prompt, but a script riding a session that has just logged in
  passes it.
- **A "confirm once" window** (re-enter the password, then several sensitive changes for some
  minutes). It pays off with many sensitive actions or users without a password; OAuth is a listed
  deferral. `ConfirmCurrentPassword` is the one place such a window would replace.
- **Counting wrong guesses in the login lockout.** One budget, but a typo in settings would block
  signing in.
- **Checking the count, then recording the failure after the comparison,** as login does. Parallel
  wrong guesses all read the same count; the review of the first build found up to 50 judged
  instead of 5.

## Consequences

- `PUT /auth/profile` changes no credential and touches no session. `UpdateProfile` takes only the
  user repository.
- Until the kit's second pull request, no route changes the email.
- When Redis is down the counter lets requests through, logged as
  `auth.credentials.redis_unavailable`, and only `userRateLimiter` bounds guesses, as for login.
- Whoever holds a stolen access token can spend the 5 attempts and block the owner's password
  change for 15 minutes; forgot-password is not counted.
- The login lockout keeps its check-then-count shape, with the parallel gap the review found here;
  #349's race-condition control is where it is taken up.

## Links

- Kit: `docs/internal/initiatives/credential-changes/` (plan, checklist, D-01, D-04, D-08)
- `src/features/shared/auth/application/use-cases/ChangePassword.ts`, `ConfirmCurrentPassword.ts`
- `src/features/shared/auth/infrastructure/http/attemptCounter.ts`, `credentialAttempts.ts`
- `__tests__/integration/api/auth-credential-changes.test.ts`
