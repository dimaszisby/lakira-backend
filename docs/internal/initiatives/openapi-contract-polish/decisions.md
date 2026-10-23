# Decisions — openapi-contract-polish

## D-01 — The probes are in the spec, under a tag the contract gate does not fuzz

- **Status:** Accepted (#215, `7acd1f9`)
- **Date:** 2026-10-23

**Context.** `GET /api/v1/health` and `GET /api/v1/ready` (`src/app.ts`) were not in the spec, so
the one body outside the error envelope, `/ready`'s `503 {"status": "degraded", "checks": …}`, was
visible nowhere a client generates types from. `docs/reference/api/README.md` called them "not part
of the API contract" (S14).
**Decision.** Both are registered under a new tag, `Health`, with no security requirement, as
login has none. `/health` documents its 200: `status` (`ok`), `environment`, `release` and
`timestamp`, all required;
`release` falls back to `"unknown"`, never empty. `/ready` documents 200 and 503 with `status`
(`ok` or `degraded`) and `checks.db` and `checks.redis` (`ok` or `fail`), and the shared 500. The
probes sit ahead of the app-wide limiter, so neither gets the 429: the generator and
`scripts/validate-openapi.ts` both skip the `Health` tag. `Health` is not in the contract gate's
`DEFAULT_TAGS`, so the gate's operation set is unchanged.
**Options considered.** _Leave them out and say so:_ S14 is open because a client cannot see the
probe document. _Fuzz them:_ `/ready` answers 503 whenever a dependency is slow, and the gate would
fail on the infrastructure, not the contract.
**Consequences.** A frontend generating types gets two operations it does not call. The 429 rule
gains its first exception, by tag.

---

## D-02 — The error envelope's `status` is an enum

- **Status:** Accepted (#215, `7acd1f9`)
- **Date:** 2026-10-23

**Context.** The seven error components typed `status` as a bare `string`, though
`envelopeStatus` (`src/shared/utils/error-envelope.ts`) is its only producer and sends `fail` for a
4xx and `error` otherwise.
**Decision.** Each 4xx component declares `enum: ["fail"]`, and `InternalServerError`
`enum: ["error"]`. So does `RateLimitError`, the schema an operation with a limiter of its own
uses for its 429, found while making the change.
**Options considered.** _`const`:_ S14 names `enum`, and the spec uses `enum` everywhere else.
_One `enum: ["fail", "error"]` on every component:_ true of the envelope, but each component's
status code already fixes the value.
**Consequences.** The frontend's generated type narrows from `string` to a literal. A reader of the
field is unaffected, so there is no Notion record.

---

## D-03 — 413 and 415 are on every operation that takes a body

- **Status:** Accepted (#215, `7acd1f9`)
- **Date:** 2026-10-23

**Context.** `express.json` answers an oversized body with 413 and an unsupported charset or
content encoding with 415, and `errorHandler` keeps both in the envelope
(`error-envelope-residuals` D-02). No operation documented either.
**Decision.** Two shared components, `PayloadTooLargeError` and `UnsupportedMediaTypeError`, and
`getOpenApiDocumentation` adds both, with `??=`, to every operation that has a `requestBody`, as it
adds the 429 to every operation. `scripts/validate-openapi.ts` fails on an operation with a body
that lacks either.
**Options considered.** _Every operation:_ a request without a JSON body is never parsed, so a GET
would document statuses it cannot produce. _Each `registerPath` call writes its own:_ that is how
40 of 47 operations came to lack the 429 (#154).
**Consequences.** A new operation with a body gets both without writing them.

---

## D-04 — The unknown-route 404 stays undocumented

- **Status:** Accepted (#215, `7acd1f9`)
- **Date:** 2026-10-23

**Context.** S14 also names the 404 `notFoundHandler` sends for a path nothing matched.
**Decision.** Not documented, for the reason the 405 is not: there is no operation to attach it
to, and a component nothing references would generate an unused type in the frontend. The comment
on the 405 in `openapi-config.ts` now says so of both. Its body is the same envelope.
**Options considered.** _An unreferenced component:_ `scripts/validate-openapi.ts` rejects
unreferenced schemas, and an unreferenced response would be the same problem.
**Consequences.** S14's last part is closed by decision.
