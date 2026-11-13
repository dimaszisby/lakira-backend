# ADR-0095 — The deploy smoke logs in as a dedicated account

- **Status:** Accepted
- **Date:** 2026-11-12
- **Related:** issue #258; the logout cookie path, #290; carries out the deferred half of
  [`ci-pipeline` D-01](../../internal/initiatives/ci-pipeline/decisions.md); extends
  [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md)'s smoke suite, whose release
  check is unchanged
- **Origin:** the owner approved the plan for #258 on 2026-11-12
- **Amended:** 2026-11-13, by [ADR-0096](./adr-0096-the-refresh-cookie-is-scoped-to-the-auth-routes.md),
  which fixed #290. The log-in step now also checks that the cookie's path covers `/auth/logout`,
  so a browser would send it there. The logout step still sends the cookie by hand, since `fetch`
  keeps no jar, as lakira-frontend's server does.

---

## Context

`npm run test:smoke` (`tests/smoke/run-smoke.mjs`) runs after every staging deploy
(`smoke_staging`) and before every production deploy, against staging. It checked the release,
`/ready`, `/health` and that a protected route answers 401, and needed nothing but a base URL. The
rest of the pre-production sequence (log in, refresh with the cookie, read, write and clean up,
log out) was run by hand with `curl`, so a skipped run left no trace. `ci-pipeline` D-01 kept the
suite fixture-free and deferred these steps, because they need an account's credentials in CI.

## Decision

- **The suite logs in as one dedicated account per environment.** It reads `SMOKE_EMAIL` and
  `SMOKE_PASSWORD`; CI takes them from the repository secrets `STAGING_SMOKE_EMAIL` and
  `STAGING_SMOKE_PASSWORD`, in both steps that run the suite. The account is created once, by
  hand, as the how-to describes.
- **After the four checks, a session runs in order and stops at its first failure:** log in,
  refresh with the cookie, read the profile, create a metric with a name unique to the run, delete
  it and see it gone, log out, and see the pre-logout cookie refused. Whatever the session
  created or opened is cleaned up even when a step fails.
- **In CI the credentials are required,** as `SMOKE_EXPECTED_RELEASE` already is: a skipped
  session would read as a pass. Outside CI, with neither set, the session reports itself skipped
  and the four checks still run. With only one of the two set, the run fails.
- **Nothing the session handles is logged:** no token, cookie, password or address. A metric is
  named by its id.
- **The logout step sends the refresh cookie to `/auth/logout` explicitly.** The cookie's path is
  `/api/v1/auth/refresh`, so a client that honours it, as a browser does, never sends it there,
  and logout revokes nothing. That is #290. The smoke proves the revoke path
  works when the cookie arrives, and switches to honouring the path once that issue is fixed.

## Options considered

- **Register a fresh user on each run:** registration allows 10 per hour per IP (ADR-0053), sends
  an email, and leaves a user behind every time. `ci-pipeline` D-01 rejected it for the same
  reasons.
- **Skip the session in CI when the secrets are missing:** a fork or a lapsed secret would then
  deploy green while proving nothing about login.
- **Honour the cookie path on logout, as a browser does:** it would fail every staging deploy
  until the cookie path is fixed, which is an interface change outside this decision.
- **Use a fixed metric name:** two runs at once (a staging deploy and a production gate), or a
  run that died before its delete, would make the next create answer 409.

## Consequences

- A real account's password is a CI secret. It is read only by the two smoke steps, and GitHub
  masks it in logs. If it lapses, or the account is locked out after failed logins (a `429`
  for 15 minutes), the staging smoke and the production gate fail until it is fixed.
- Each run leaves one soft-deleted metric on the smoke account; nothing reads it.
- The integration suite runs the script itself against the real app over HTTP
  (`__tests__/integration/smoke/run-smoke.test.ts`), so a change to a route the session uses
  fails there before it reaches staging.
- A smoke after the production deploy still does not exist; the production gate checks staging.
