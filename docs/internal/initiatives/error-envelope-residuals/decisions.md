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

- **Status:** Proposed
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
