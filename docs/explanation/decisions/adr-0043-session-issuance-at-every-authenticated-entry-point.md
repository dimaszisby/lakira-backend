# ADR-0043 — Session issuance belongs to every authenticated entry point

- **Status:** Accepted
- **Date:** 2026-09-20
- **Origin:** `D-01` in the registration-session kit —
  [`registration-session`](../../internal/initiatives/registration-session/decisions.md)

---

## Context

[ADR-0019](./adr-0019-refresh-token-storage-and-rotation.md) specified the refresh-token design and
stated that "existing `LoginUser` use case grows to also call `IssueRefreshToken`". It never
mentions registration. The omission shipped: `POST /auth/register` returned a 15-minute access token
and set no refresh cookie, while `login`, `refresh` and `switchOrg` all set one. A newly registered
user was silently logged out when their access token expired.

That defect was reported as a missing line in the controller. It was not — `RegisterUser` had no
`IssueRefreshToken` dependency and minted no refresh token to set.

The ambiguity that made this expensive to diagnose is that registration also fires
`requestEmailVerification`, which reads like a deliberate "register, then verify, then log in"
stance under which withholding a session would be correct. It is not that:
[ADR-0018](./adr-0018-verification-middleware-not-applied-to-existing-routes.md) decided that this
base gates nothing on email verification and that forks wire `requireVerifiedEmail` themselves.
There is no verification wall for registration to be held behind.

## Decision

**Any endpoint that returns an access token also issues a refresh token and sets the refresh
cookie.** There is no such thing as a half-session.

This is a rule about entry points, not about registration specifically. `login`, `register`,
`refresh` and `switchOrg` satisfy it today; any future entry point that authenticates a principal
must satisfy it too.

## Options considered

- _Remove the access token from the registration response instead, sending new users to log in._
  Rejected. **(a)** ADR-0018 already settled that verification gates nothing, so the flow this would
  serve does not exist. **(b)** `createTestUser`
  (`__tests__/integration/helpers/test-utils.ts`) reads the token from the register response; the
  whole integration suite builds its users that way. **(c)** Registering into an active session is
  the dominant pattern in comparable products, and the strict wall is a high-abuse-risk
  specialisation this template should not impose on forks.
- _Leave the behaviour as it was._ Rejected: it is indefensible under **both** readings. It issued a
  fully-privileged 15-minute token to an unverified address with no refresh-token family, so there
  was no revocation path short of waiting for expiry.

## Consequences

- `RegisterUser` takes `IssueRefreshToken` and a `TransactionPort`; its result grows
  `rawRefreshToken`. DI wiring and the controller follow.
- Registration sessions become revocable through the existing `RevokeRefreshTokenFamily`, and their
  token rows carry `user_agent`/`ip` for auditing, as ADR-0019 intended for login.
- **No OpenAPI change.** No endpoint documents its `Set-Cookie` header, so adding a fourth produced
  no spec diff. That gap is tracked separately in
  `docs/internal/todos/2026-09-20-todo-document-set-cookie-responses.md`.
- Forkability improves: the expensive direction ships pre-built. A fork wanting the strict
  register-then-verify wall adds a middleware, rather than re-threading a use case, its DI and its
  controller.

## Links

- [ADR-0018](./adr-0018-verification-middleware-not-applied-to-existing-routes.md) — why no route
  gates on verification
- [ADR-0019](./adr-0019-refresh-token-storage-and-rotation.md) — the design this closes a gap in
- `docs/internal/todos/2026-09-18-todo-register-refresh-token.md` — the brief (#98)
- `src/features/shared/auth/application/use-cases/RegisterUser.ts`
