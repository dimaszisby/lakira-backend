# Error Envelope Residuals — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Unknown routes get a JSON 404 from a dedicated handler before `errorHandler`

- **Status:** Accepted
- **Date:** 2026-09-30

**Context.** No middleware runs for an unmatched route, so Express answers with its default HTML
page — the only `text/html` error the API emits.
**Decision.** `notFoundHandler` (`src/shared/middleware/not-found.ts`), mounted last before
`errorHandler`, calls `sendError(res, 404, "Route not found")` directly.
**Options considered.** Throwing `AppError(404)` into `errorHandler`: rejected, it would log every
scanner probe at `error` as `Error Occurred: …`; the access log already records the request.
Echoing `METHOD path` in the message: rejected, it reflects attacker-controlled input and gives a
client nothing it did not send.
**Consequences.** Unknown routes are visible only in the access log. The message is fixed, so a
client cannot distinguish a typo from a removed route — the same as today.

## D-02 — `errorHandler` passes through errors that declare themselves client-safe

- **Status:** Accepted
- **Date:** 2026-09-30

**Context.** body-parser and raw-body raise `http-errors` instances — 413, 415, 400, 403 — with a
numeric `status` and `expose: true`. `errorHandler` recognises only `SyntaxError` parse failures,
so the rest become a masked 500 and a Sentry event.
**Decision.** An error with a numeric `status` in 400–499 and `expose === true` maps to
`AppError(err.message, err.status)`, inside the existing mapping so logging and the 5xx-only
Sentry rule apply unchanged. Recognised by shape, not by importing `http-errors`. The existing
`SyntaxError` branch keeps precedence for its malformed-JSON message and `errors` array.
**Options considered.** Enumerating body-parser `type` strings: rejected, any type not listed
falls back to 500 silently. A fixed message per status: rejected, `expose` is exactly the flag
that marks the message safe. A direct `http-errors` dependency for `isHttpError`: rejected, a new
dependency for a two-field check.
**Consequences.** Any future middleware following the `http-errors` contract is handled for free.
An error that sets `expose: true` wrongly would leak its message — the flag's owner is trusted.
body-parser's 415 messages quote the client's own charset or encoding value (`unsupported charset
"KOI8-R"`). Unlike D-01's path echo this is accepted: the value is one header token the client
sent, rendered in JSON, and it is what tells the client what to fix.

## D-03 — The 429 envelope ships in a second PR, after lakira-frontend agrees

- **Status:** Accepted
- **Date:** 2026-09-30

Promoted to the architecture decision registry as **[ADR-0057](../../../explanation/decisions/adr-0057-rate-limiters-answer-through-the-error-envelope.md)**.
That file is authoritative; this entry is a pointer.

## D-04 — An undecodable path parameter answers a fixed 400, not a masked 500

- **Status:** Accepted
- **Date:** 2026-09-30

**Context.** Found in review of Phase 1. When a path parameter is not valid percent-encoding
(`GET /api/v1/metrics/%zz/trends`), Express 4's `decode_param` raises a `URIError` with
`status: 400` but no `expose`, and a message quoting the raw parameter. D-02 correctly does not
match it, so it still became a masked 500 and a Sentry event — reproduced with an authenticated
request. Unauthenticated requests never reach it: the auth guard answers 401 first.
**Decision.** A `URIError` carrying `status: 400` maps to `AppError("Malformed URL", 400)`, logged
at `warn` like D-02. The message is fixed rather than Express's, so the parameter is not echoed.
**Options considered.** Setting `expose` on it and reusing D-02: rejected, it would pass through
Express's message, which reflects the parameter. Leaving it to a follow-up: rejected, it is the
same residual class C3 names, and the next dated audit would reopen C3 over it.
**Consequences.** Any `URIError` with status 400 is treated as a client error. Only Express's
param decoding raises that combination today.

## D-05 — One shared handler answers for every limiter

- **Status:** Accepted
- **Date:** 2026-10-03

Promoted to the architecture decision registry as **[ADR-0057](../../../explanation/decisions/adr-0057-rate-limiters-answer-through-the-error-envelope.md)**.
That file is authoritative; this entry is a pointer.

## D-06 — The frontend handoff is a Notion record, not a file in this kit

- **Status:** Accepted
- **Date:** 2026-10-03

**Context.** The plan of 2026-09-30 named a `frontend-note.md` in this kit. On 2026-10-01 the owner
set the Notion page "FE and BE messages" as the channel for anything lakira-frontend must decide or
act on.
**Decision.** The record in Part 2 of that page, and no `frontend-note.md`. The record already
exists: "Rate-limit (429) body moves into the error envelope", raised 2026-10-01 as
`Needs decision`. It is updated with the answer to Q-1 and what to do after the merge, not
duplicated. The change qualifies for the page: the frontend has to sync the spec, regenerate its
types and update two test fixtures.
**Options considered.** Both a file and a record: rejected, two copies drift. The file alone:
rejected, the frontend's working queue is the Notion page.
**Consequences.** The handoff is not in git. The ADR and this kit carry the reasoning; the record
carries only what the frontend has to do.

## D-07 — The readiness probe's 503 body is a named exception to the envelope

- **Status:** Accepted
- **Date:** 2026-10-03

Promoted to the architecture decision registry as **[ADR-0057](../../../explanation/decisions/adr-0057-rate-limiters-answer-through-the-error-envelope.md)**.
That file is authoritative; this entry is a pointer.

## D-08 — The generator documents the 429 on every operation

- **Status:** Accepted (merged in #154, `e725452`)
- **Date:** 2026-10-11

**Context.** The audit of 2026-10-10 kept caveat C3 open on finding V5. `globalRateLimiter` is
mounted before every router (`src/server.ts`), so any documented operation can answer
`429 {"status":"fail","message":"..."}`. The spec documented a 429 on 7 of its 47 operations, the
ones with a limiter of their own. Each operation's responses are written by hand in
`src/lib/openapi/openapi-docs.ts`, and 40 authors did not write it. ADR-012 of the audit folder
names V5 as the one route C3 closes on.
**Decision.** `getOpenApiDocumentation()` adds
`429: { $ref: "#/components/responses/TooManyRequestsError" }` to every operation that does not
declare a 429. An operation that describes its own keeps it. `scripts/validate-openapi.ts` fails
when an operation has none, so the gate holds whatever builds the document.
**Options considered.** Writing the response into 40 `registerPath` calls: rejected, the next route
forgets it the same way. A wrapper around `registry.registerPath`: rejected, the same effect with
47 call sites changed. A sentence in the spec's description: rejected, a generated client gets no
type from prose.
**Consequences.** A route author writes a 429 only when the route has its own limiter and the text
should name it. An operation mounted before the limiter would be documented with a 429 it cannot
return; none is in the spec today (`/health` and `/ready` are not documented). If one is added, the
exemption goes in the same loop and in the validator, by path.

## D-09 — Response headers are declared from shared components: the refresh cookie and the analytics validator

- **Status:** Accepted (merged in #168, `6f686e6`)
- **Date:** 2026-10-14

Micro entry for register row B-13 (the todo of 2026-09-20; lakira-frontend's F-15), on
`fix/spec-set-cookie-and-304`. Written before any code.

**Context.** The spec is a contract lakira-frontend generates types from, and no registration
under `src/lib/openapi/` declares a response header. Register, login, refresh and switch-org set
the refresh cookie and none documents it; `POST /auth/refresh` documents the cookie it reads and
not the one it sets. Both analytics routes send `ETag` and `Cache-Control` and answer 304 to a
matching `If-None-Match`, and the spec has none of it. Read while planning, and in neither the
todo nor the analysis: `POST /auth/logout` clears the same cookie, which is a `Set-Cookie` too.
**Decision.** Five points.

1. `components.headers` gains `RefreshCookie`, `ClearedRefreshCookie`, `ETag` and
   `VisualizationCacheControl`, declared once in `src/lib/openapi/openapi-config.ts`. A route
   points at them with `$ref`.
2. Five routes carry the cookie: register, login, refresh and switch-org reference
   `RefreshCookie` on their success response, and logout references `ClearedRefreshCookie`.
3. Both analytics routes document the conditional request whole: the two headers on the 200, a
   304 with the same two and no body, and the optional `If-None-Match` request header.
4. A header a route always sends is marked `required`, unless the contract gate shows that to be
   wrong. Its `response_headers_conformance` check has never had a documented header to judge.
5. The cookie's name comes from the app's name, as it does where the spec already names it.

**Options considered.** Writing the header out per route: rejected, five copies to drift. A rule
in `scripts/validate-openapi.ts` that a cookie-setting route must declare it: rejected, the
validator cannot know which handlers set a cookie, so the rule would be a hand-kept list and a
second place to forget. Documenting the 304 without the request header: rejected, a 304 with no
documented way to ask for one is half a contract. Taking B-47 and the spec part of B-65 in the
same change, so the frontend syncs once: not taken, neither has been analysed.
**Consequences.** Nothing a route sends changes. lakira-frontend's generated types gain response
headers on seven operations and a 304 on two when it next syncs the spec. A new route that sets a
cookie or a validator declares it from these components; nothing checks that it does.
**What the contract gate showed.** `npm run contract:local:gate` (Schemathesis 4.4.4) on the
tree at `61df15f`: 42 of 47 operations selected, 1443 cases generated and passed, 2 warnings. On
the branch: the same 42, 1446 cases generated and passed, the same 2 warnings. To see whether
`response_headers_conformance` judges a `required` header at all, one that no route sends was
declared beside the cookie and the gate run again: it failed with "Missing required headers" on
`POST /auth/register` and `POST /auth/login`, and the probe was removed. So point 4 stands, and
every header here is `required`.
**What the gate does not reach.** The same probe did not fail on `POST /auth/refresh` or
`POST /auth/switch-org`, which reference the same component: the gate never gets a success from
either (it holds no refresh cookie and no second organization; both are in its standing
warnings). It never sends `If-None-Match` with a real validator either, so it never sees a 304.
`__tests__/integration/api/spec-response-headers.test.ts` sends all seven requests for real and
checks each response against the headers the spec marks required for that status.
**From the review,** my own. The fork test counted one backticked mention of the cookie's name
in the spec; there are three now, and the count was updated. A fork's spec still holds nothing
of the upstream's name. The example `Max-Age=604800` is seven days, the default lifetime; a
deployment that changes `REFRESH_TOKEN_TTL_DAYS` sends another number, and the description says
"the refresh token's lifetime". `Secure` is described as added in staging and production, which
is what the controller does. Not graded by anyone else.
