# Error Envelope Residuals — Plan

- **Status:** Approved (Phase 1); Phase 2 on hold for lakira-frontend
- **Appetite:** 1 day per phase — past that, cut scope rather than extend
- **Date:** 2026-09-30

## Context and goals

The dated re-audit (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 4.1,
`saas-gold-reaudit` D-05) reopened C3 at P2. Three paths still answer outside the single envelope
in `src/shared/utils/error-envelope.ts`:

1. **Unknown routes** return Express's HTML 404 — no not-found handler runs before
   `errorHandler` (`src/server.ts:235`).
2. **body-parser client errors** — oversized body (413), unsupported charset or encoding (415),
   aborted request or size mismatch (400) — become a masked 500 and are reported to Sentry. They
   are `http-errors` instances with `expose: true` and a 4xx `status`, but `error.ts` only
   recognises `SyntaxError` parse failures.
3. **Every rate limiter** answers `{status: 429, message}` with a numeric `status`
   (`src/shared/middleware/rate-limiter.ts`), documented as a deliberate exception in
   `src/lib/openapi/openapi-config.ts`.

Items 1 and 2 change no documented contract and ship first. Item 3 changes the OpenAPI schema and
lakira-frontend's generated types, so it ships separately with an ADR and a cross-repo note.

When both land, every non-2xx JSON body the API emits has the envelope shape.

## Acceptance criteria

- **AC-1** — Any unmatched method and path returns `404`, `application/json`,
  `{"status":"fail","message":"Route not found"}`; the path is not echoed; nothing is sent to
  Sentry. _Why:_ C3 residual 1.
- **AC-2** — An oversized JSON body returns
  `413 {"status":"fail","message":"request entity too large"}`; nothing is sent to Sentry.
  _Why:_ C3 residual 2.
- **AC-3** — An unsupported charset returns `415 {"status":"fail", …}`; nothing is sent to Sentry.
  _Why:_ C3 residual 2.
- **AC-4** — An error with `expose: false` or a 5xx `status` still returns 500, masked in
  production, and is still sent to Sentry. _Why:_ only errors that declare their message safe may
  pass it through.
- **AC-5** (Phase 2) — Every limiter answers `429 {"status":"fail","message":…}` through
  `sendError`, with the `RateLimit-*` headers kept; `TooManyRequestsError` documents that shape
  and the spec validates. _Why:_ C3 residual 3.

## Open questions

- [ ] **Q-1** — Phase 2 start: has lakira-frontend agreed to `status: "fail"` on 429? Blocks
      Phase 2 only.

## Out of scope

- Documenting 413 and 415 per operation in the OpenAPI spec.
- Unknown paths under an authenticated router answering 401 before 404.
- Audit quick wins R1, R2, R6.
- The dated audit run that restates C3's status.

## Decisions expected

- How unknown routes are answered (D-01).
- How body-parser errors are recognised (D-02).
- Whether the 429 change ships with Phase 1 (D-03) — promoted to an ADR in Phase 2.

## Phases

### Phase 1 — 404 and 4xx mapping (`fix/error-envelope-residuals`)

- `src/shared/middleware/not-found.ts` — `notFoundHandler` / `createNotFoundHandler`, answering
  through `sendError`; mounted in `src/server.ts` immediately before `errorHandler`.
- `src/shared/middleware/error.ts` — an `isExposedClientError` guard feeding the existing
  `appError` mapping; exposed 4xx logged at `warn`.
- Unit tests for both modules; one integration file driving `src/server.ts` via supertest.

### Phase 2 — 429 envelope (`fix/error-envelope-residuals-429`)

- `rate-limiter.ts` — one shared handler calling `sendError`.
- `TooManyRequestsError` rewritten to the envelope; spec regenerated.
- D-03 promoted to an ADR; `frontend-note.md` in this kit for the cross-repo handoff.

## Risks and trade-offs

- Schemathesis `status_code_conformance` may now observe an undocumented 413/415 where it saw a 500. `contract:local:gate` is run as a check; if it trips, per-operation 413/415 docs move in
  scope.
- Phase 2 is a breaking response-shape change for any client parsing a numeric `status`.

## Rollback

Code: revert-safe — no migrations, no data written. Phase 2 revert restores the numeric `status`
and must be coordinated with lakira-frontend the same way the change was.

## Security and data

The 4xx mapping passes an error's own message to the client only when the error sets
`expose: true` (the `http-errors` contract); everything else keeps the 5xx path, masked in
production. The 404 body does not reflect the request path.

## Observability

Client 4xx from body-parser drop from `error` to `warn` and stop reaching Sentry. Unknown routes
appear only in the access log.

## References

- `docs/internal/todos/2026-09-29-todo-error-envelope-residuals.md`
- `docs/internal/todos/2026-09-01-todo-error-envelope.md` — the original C3 fix (#79)
- `docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md` § 4, C3
