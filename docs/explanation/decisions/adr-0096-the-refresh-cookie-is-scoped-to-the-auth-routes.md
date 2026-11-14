# ADR-0096 — The refresh cookie is scoped to the auth routes

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** issue #290; amends [ADR-0019](./adr-0019-refresh-token-storage-and-rotation.md)
  point 3 (the cookie's path) and states what its point 6 does in practice; found while building
  [ADR-0095](./adr-0095-the-deploy-smoke-logs-in-as-a-dedicated-account.md)'s smoke session
- **Origin:** the owner chose this fix on 2026-11-13, over narrowing or closing #290

---

## Context

`POST /auth/logout` revokes the refresh-token family of the refresh cookie the request carries,
and only that. The cookie was scoped to `Path=/api/v1/auth/refresh`, so a browser talking to the
backend directly never sent it to `/auth/logout`: logout answered `200`, cleared the cookie, and
left the token valid until it expired.

lakira-frontend is not affected. Its browser never holds the backend's cookie: the frontend's
server re-scopes it to its own `/api` path, and its logout route reads it there and sends it to
the backend's `/auth/logout` itself. The defect hits only a browser client on the API's own
origin. There is none today; a fork of this template with its own frontend is the likely one.

## Decision

- **The refresh cookie's path is `/api/v1/auth`.** A browser sends it to `/auth/refresh` and
  `/auth/logout` alike. Its name, `HttpOnly`, `SameSite=Strict`, `Secure` in staging and
  production, and its lifetime are unchanged. The cookie that clears it uses the same path.
- **Logout revokes by the cookie only, and says so.** The spec no longer claims a bearer-token
  path, which was never built; it declares the cookie as an optional request cookie.

## Options considered

- **A second cookie scoped to `/api/v1/auth/logout`:** two cookies to keep in step through every
  rotation, for no gain over one wider path.
- **Revoke by the access token on logout:** an access token names no refresh family, so it would
  mean revoking every session the user has, which is a different feature.
- **Document "send the cookie yourself" as the contract:** what lakira-frontend's server does,
  but it leaves a browser client on the API's origin unable to log out.
- **Clear the old-path cookie during a transition:** see Consequences.

## Consequences

- A direct client also sends the cookie to the other `/auth/*` routes. None of them reads it, and
  it stays `HttpOnly` and `SameSite=Strict`.
- A browser on the API's origin that holds a cookie issued before this change keeps it beside the
  new one, and after one rotation its next refresh presents the old token: reuse detection then
  logs it out, once. No such client exists and production is not provisioned, so no transition
  code clears the old path.
- lakira-frontend reads the cookie by name and re-scopes it, so its behaviour does not change. Its
  CI checks its copy of the spec against `dev`, so it re-syncs the spec once this merges.
- The smoke session checks that the cookie's path covers `/auth/logout`, and the integration
  suite logs out through a cookie jar that honours paths, as a browser does.
