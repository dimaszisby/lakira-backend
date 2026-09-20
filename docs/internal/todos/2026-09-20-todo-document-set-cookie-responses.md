# Todo — the refresh cookie is set by four endpoints and documented by none

- **Status:** Open
- **Created:** 2026-09-20
- **Owner:** unassigned
- **Origin:** discovered while planning the `registration-session` kit
  (`docs/internal/initiatives/registration-session/`), see
  [D-03](../initiatives/registration-session/decisions.md)

---

## What

`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` and `POST /auth/switch-org` all set
the `{APP_SHORT_NAME}_refresh` cookie. **None of them declares a `Set-Cookie` response header in the
OpenAPI spec** — `grep -n "headers\|Set-Cookie" src/lib/openapi/openapi-docs.ts` returns nothing.

The cookie is load-bearing: `POST /auth/refresh` is cookie-only and rejects an `Authorization`
header outright (`auth-refresh.test.ts` › "rejects Authorization header (cookie-only)"). A consumer
generating a client from this spec has no way to learn that from the contract.

## Why it was not fixed in the registration-session PR

That PR set the cookie on a fourth endpoint. Documenting only the endpoint it touched would have
made the gap less consistent, not more — three endpoints documented one way and one another. The
coherent change is all four at once, which is its own small PR.

## Scope

`src/lib/openapi/openapi-docs.ts` — add a `headers` entry to the success response of all four
operations. Regenerate `docs/reference/api/lakira-backend-openapi.json` via
`npm run docs:openapi:check`.

**This one does change the published contract**, so `lakira-frontend` will need
`npm run api:spec:sync && npm run api:types:generate`. Worth batching with the undocumented 304 on
both `/analytics` routes (`2026-08-31-todo-analytics-304-etag.md` § "Left undone deliberately") so
that repo syncs once.

## Verification

`npm run docs:openapi:check` must show the four operations gaining the header, and
`docs:openapi:validate` must still pass.
