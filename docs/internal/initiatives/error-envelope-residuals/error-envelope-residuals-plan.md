# Error Envelope Residuals — Plan

- **Status:** Done — Phase 1 merged in #124; Phase 2 approved 2026-10-03, complete on
  `fix/error-envelope-residuals-429`
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
- **AC-6** (Phase 2, added 2026-10-03) — No file under `src/` writes a numeric `status` into an
  error body, and a test fails if a limiter is added that answers any other way. _Why:_ the
  residual survived the original C3 fix because nothing guarded it, and R1 added a ninth limiter
  with the old shape on 2026-10-02.
- **AC-7** (Phase 2, added 2026-10-03) — lakira-frontend has a record naming the shape change and
  the actions it needs. _Why:_ D-03 made the change conditional on a cross-repo handoff.

## Open questions

- [x] **Q-1** — Phase 2 start: has lakira-frontend agreed to `status: "fail"` on 429? Blocks
      Phase 2 only. **Answered 2026-10-03: yes**, by the repository owner, who also owns
      lakira-frontend, on choosing Phase 2 as the next task. A read of lakira-frontend the same
      day found nothing that reads the body's `status` on a 429: `normalizeApiError.ts`,
      `handleApiError.ts`, `api.ts` and the list hooks branch on the HTTP status code.

## Out of scope

- Documenting 413 and 415 per operation in the OpenAPI spec.
- Unknown paths under an authenticated router answering 401 before 404.
- Audit quick wins R1, R2, R6.
- The dated audit run that restates C3's status.

## Decisions expected

- How unknown routes are answered (D-01).
- How body-parser errors are recognised (D-02).
- Whether the 429 change ships with Phase 1 (D-03) — promoted to ADR-0057 in Phase 2.
- How the limiters share one answer (D-05), where the frontend handoff lives (D-06), and whether
  the readiness probe's 503 joins the envelope (D-07) — settled in Phase 2.

## Phases

### Phase 1 — 404 and 4xx mapping (`fix/error-envelope-residuals`)

- `src/shared/middleware/not-found.ts` — `notFoundHandler` / `createNotFoundHandler`, answering
  through `sendError`; mounted in `src/server.ts` immediately before `errorHandler`.
- `src/shared/middleware/error.ts` — an `isExposedClientError` guard feeding the existing
  `appError` mapping; exposed 4xx logged at `warn`.
- Unit tests for both modules; one integration file driving `src/server.ts` via supertest.

### Phase 2 — 429 envelope (`fix/error-envelope-residuals-429`)

- `rate-limiter.ts` — one shared handler calling `sendError` (D-05).
- `TooManyRequestsError` and `RateLimitErrorSchema` rewritten to the envelope; spec regenerated.
- A test over all nine limiters with the real `express-rate-limit`, and an architecture guard
  (AC-6).
- D-03 promoted to an ADR. The cross-repo handoff is a record on the Notion "FE and BE messages"
  page, not a `frontend-note.md` in this kit (D-06).

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
