# ADR-0097 — A password reset or change ends every other session

- **Status:** Accepted
- **Date:** 2026-11-24
- **Related:** issue #308 (finding Y6 of the dated run of 2026-11-14, #299); builds on
  [ADR-0019](./adr-0019-refresh-token-storage-and-rotation.md) (refresh tokens, families, reuse
  detection) and [ADR-0096](./adr-0096-the-refresh-cookie-is-scoped-to-the-auth-routes.md) (the
  cookie reaches every `/auth/*` route)
- **Origin:** the owner chose the two options below on 2026-11-24, in the plan for #308

> **Status note (2026-11-24).** The password change moved from `PUT /auth/profile` to
> `POST /auth/change-password`, which asks for the current password
> ([ADR-0098](./adr-0098-credential-changes-ask-for-the-current-password.md)).
> The re-issued cookie moved with it, now `RefreshCookie` on that route's 200;
> `ReissuedRefreshCookie` is gone. The decision below is unchanged.

---

## Context

A password reset (`ResetPassword`) saved the new hash and spent the reset token. A password change
(`PUT /auth/profile`, `UpdateProfile`) saved the new hash. Neither touched the user's refresh
tokens, so a refresh cookie taken before the change kept rotating for up to
`REFRESH_TOKEN_TTL_DAYS` (30 by default). Changing a password is what a user does when they think
someone else is signed in as them, and it did not sign that someone out. Organization switching
already revoked every session (`SwitchOrganization`).

ASVS v4 3.3.3 (Level 2) asks for the same thing: a password change, including one through reset,
can end every other active session.

## Decision

1. **A reset or a change revokes every refresh token the user has**, in one statement
   (`RefreshTokenRepository.revokeAllForUser`: `revoked_at` set where `user_id` matches and
   `revoked_at` is null). It runs in the transaction that saves the new hash, so a password never
   changes without its sessions ending. A reset spends its token in the same transaction.
2. **The session that changed its password stays signed in.** After the revocation, still in the
   same transaction, `UpdateProfile` issues that session a new refresh token, in a new family, for
   the organization of its access token, and the controller sets it as the cookie. The response
   body is unchanged; the spec declares the cookie as an optional `Set-Cookie`
   (`ReissuedRefreshCookie`), since it is sent only when the password changed. A reset has no
   session of its own, so it issues nothing, as before: "Caller must log in."
3. **Refresh tokens only.** An access token issued before the change stays valid until it expires
   (`ACCESS_TOKEN_TTL_SEC`, 900 seconds by default).
4. **A token revoked where it stood answers 401 without the reuse alarm.** Rotation used to log
   `auth.refresh.reuse_detected` for any revoked token presented to `/auth/refresh`. After this
   change every other device of the user would raise it on its next refresh. Only a token that was
   rotated away (`replaced_by_id` set) is evidence of theft; one revoked without being rotated (by
   logout, by a password reset or change, by an organization switch) is a session that ended. Both
   answer 401, and both still revoke the family.

## Options considered

- **Sign out everywhere, the changing session included.** Simpler: no token to issue and no
  cookie to set. Rejected by the owner: the user who just changed their password would be logged
  out 15 minutes later, with no reason given.
- **Keep the changing session's own family by reading its cookie.** The cookie reaches
  `PUT /auth/profile` (ADR-0096), so its family could be spared. Rejected: a client that sends no
  cookie would lose the session anyway, and a fresh token in a new family gives the same result
  without trusting a token the request may not carry.
- **A `users.password_changed_at` that `authMiddleware` and rotation compare against.** It would
  also end access tokens at once, and close the race below. Rejected for now by the owner: it
  needs a migration, a new field on the user, and the token's `iat` read through the
  `TokenProvider` port, for a window of at most `ACCESS_TOKEN_TTL_SEC`. It is the next step if
  that window has to close.
- **Move `SwitchOrganization` to `revokeAllForUser` in the same change.** Left out to keep the
  change to what the finding asks; see Consequences.

## Consequences

- **Accepted gap: the access-token window.** An access token issued before the change keeps
  working for up to 15 minutes. A test pins this (`auth-session-revocation.test.ts`), so closing
  it is a visible change.
- **Accepted gap: a refresh in flight.** Under read committed, the revoking `UPDATE` does not see a
  token that a refresh running at the same instant inserts and commits after the statement
  starts, so that one token survives. It needs a refresh racing the change to the millisecond;
  `password_changed_at` would close it.
- **Until #309, a stolen access token reaches further.** `PUT /auth/profile` asks for no current
  password (Y7), so a stolen 15-minute access token could already set a new password and log in
  with it. Now the same request also ends the owner's other sessions and leaves the thief holding
  the only live refresh token. #309 closes this by asking for the current password.
- **Lock order.** Both use cases revoke before they write the user row. A request that changes
  the email or the username with the password takes the strongest row lock on the user, which
  conflicts with the key-share lock a concurrent refresh needs to insert its token; that refresh
  holds a token row the revocation must wait for. Written the other way round, the two deadlock.
- **Logs.** A reset or change logs `auth.sessions.revoked` with the user id and the reason; a
  refresh with an ended session logs `auth.refresh.session_ended` at `info`, with ids only.
- **Not changed here, found in review.** A reset token's single use is checked outside the
  transaction, so two submissions racing each other can both succeed; and a password change
  leaves a reset link already sent usable until it expires.
- `ResetPassword` and `UpdateProfile` take the refresh-token repository and the `TransactionPort`;
  `UpdateProfile` also takes `IssueRefreshToken`, and its input carries the session's organization,
  user agent and IP. `UserRepository.save` and `PasswordResetTokenRepository.markUsed` accept a
  transaction.
- A reset used to save the hash and spend the token in two separate writes; they now commit
  together, with the revocation.
- `SwitchOrganization` still ends sessions its own way: it reads the active tokens and revokes
  their families one by one. The result is the same, apart from the in-flight race, which it has
  too.
- lakira-frontend is not affected. It does not call `PUT /auth/profile`, and its proxy keeps a
  refresh cookie from any response it relays. Its other sessions already handle a refresh that
  answers 401.
- A dated audit run confirms the fix before #308 closes.

## Links

- Issue #308; `docs/internal/audits/saas-readiness/audit-2026-11-14.md` § 6, Y6
- `src/features/shared/auth/application/use-cases/ResetPassword.ts`,
  `UpdateProfile.ts`, `RotateRefreshToken.ts`
- `__tests__/integration/api/auth-session-revocation.test.ts`
