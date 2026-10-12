# B-13 — `Set-Cookie` and the 304 are missing from the spec

Register row [B-13](register.md). Read at `bf72b58`. On the Notion page as a heads-up to the
frontend (Part 2, Open, 2026-10-01).

## 1. What is wrong

Four endpoints set the refresh cookie and none documents it. `setRefreshCookie`
(`src/features/shared/auth/infrastructure/http/controller.ts:39`) is called by register, login,
refresh and switch-org; their registrations in `src/lib/openapi/openapi-docs.ts` (`:74`, `:119`,
`:250`, `:461`) declare no response header. `POST /auth/refresh` does document the cookie it reads (`:254-258`);
what it sets in return is not in the spec.

Both analytics routes answer `304` to a matching `If-None-Match`
(`src/features/public/analytics/infrastructure/http/controller.ts:71`) and the spec documents
neither the 304 nor the `ETag` and `Cache-Control` headers of the 200. Counted in the committed
spec: 0 responses with a `Set-Cookie` header, 0 operations with a 304.

## 2. Root cause

The spec is generated from registrations written by hand per route. Headers were never part of
the pattern: no registration in `src/lib/openapi/` declares any.

## 3. Options

- **A. Declare the headers per route**, in the four auth registrations and the two analytics ones.
  Six edits; nothing stops the next cookie-setting route from omitting it.
- **B. Shared header components** (`RefreshCookie`, `ETag`), referenced by the six routes, as the
  shared 429 is. Same edits, one definition.
- **C. B, plus a validator rule** in `scripts/validate-openapi.ts`: an operation whose path is
  under `/auth` and sets the cookie must declare it. The validator cannot know which handlers set
  a cookie, so the rule would be a hand-kept list.

## 4. Recommendation

**B.** A validator rule keyed on a hand-kept list adds a second place to forget. Batch the cookie
and the 304 in one PR, as the todo already plans, so the frontend syncs once. `S14`'s contract
polish (B-47: the probes absent from the spec, `status` not an enum, 413 and 415 undocumented) is
the natural companion if one spec change is wanted instead of two.

## 5. Acceptance criteria for the fix

- **AC-1** — The 200 or 201 of the four auth endpoints declares a `Set-Cookie` header, described
  with the cookie's name pattern, `HttpOnly`, and its path. _Why:_ the todo.
- **AC-2** — `POST /auth/refresh` documents the rotated cookie it sets, beside the request cookie
  it already documents. _Why:_ rotation is the point of the route, and only half of it is visible.
- **AC-3** — Both analytics routes document a 304 with no body, and `ETag` and `Cache-Control` on
  the 200. _Why:_ the frontend's client must not treat a 304 as an error.
- **AC-4** — `docs:openapi:check` passes, and the contract gate still passes on 42 operations.
  _Why:_ Schemathesis validates responses against the spec; a documented header it does not
  receive would fail.
- **AC-5** — On a fork, the cookie's documented name is the fork's. _Why:_ bootstrap rewrites the
  cookie name in the spec (`scripts/bootstrap-fork.sh:226`); a new mention must be covered by it
  or by the generator.

## 6. Size and shape

≤½ day. Micro entry in `error-envelope-residuals/decisions.md` or its own. No ADR: the contract is
described, not changed. Gates: typecheck, lint, format, tests, build, OpenAPI; the contract gate
should be run by hand since response headers are new to it.

## 7. Depends on, unblocks

Depends on nothing. When it ships, the Notion record moves to "Action needed": the frontend runs
`api:spec:sync` and `api:types:generate` once.

## 8. Not verified

- How `@asteasolutions/zod-to-openapi` expresses a response header and a body-less 304; the
  library supports both in OpenAPI 3, and the registration syntax was not tried.
- Whether Schemathesis flags a documented `Set-Cookie` that is absent on some 200 (a refresh that
  rotates nothing does not exist today, but check).
- AC-5: whether the generator or the bootstrap `sed` reaches a cookie name inside a header
  description.
