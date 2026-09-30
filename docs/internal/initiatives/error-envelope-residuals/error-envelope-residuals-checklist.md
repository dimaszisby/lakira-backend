# Error Envelope Residuals — Checklist

## Phase 0 — Kit and branch

- [x] Branch `fix/error-envelope-residuals` off `dev` at `ed54562`, `--no-track`
- [x] Kit: `README.md`, `error-envelope-residuals-plan.md`, this checklist, `decisions.md`
      (D-01–D-03)

## Phase 1 — 404 and 4xx mapping

- [x] `src/shared/middleware/not-found.ts` — `notFoundHandler` / `createNotFoundHandler` via
      `sendError`
- [x] `src/server.ts` — `notFoundHandler` mounted immediately before `errorHandler`
- [x] `src/shared/middleware/error.ts` — `isExposedClientError` feeding the `appError` mapping;
      exposed 4xx logged at `warn`
- [x] `__tests__/unit/shared/middleware/error.test.ts` — 413/415/400 pass through; `expose:false`
      and 5xx stay 500; Sentry only for 5xx
- [x] `__tests__/unit/shared/middleware/not-found.test.ts` — envelope, status, no path echo
- [x] `__tests__/integration/middleware/error-envelope-residuals.test.ts` — unknown GET, POST,
      `/api/v1/*`; oversized body; bad charset
- [x] New tests shown failing against the pre-fix source — unit 3/5 new cases failed
      (500 for 413/415/400; the two guard cases pass by design), `not-found.test.ts` failed
      to import, integration 5/5 failed (HTML 404, 500 for 413/415)

## Phase 2 — 429 envelope (on hold: Q-1)

- [ ] `src/shared/middleware/rate-limiter.ts` — one shared handler via `sendError`
- [ ] `TooManyRequestsError` rewritten to the envelope; spec regenerated and valid
- [ ] D-03 promoted to ADR-NNNN; `frontend-note.md`
- [ ] Limiter tests updated for the new body

## Discovered

- [x] Found in review: an undecodable path parameter (`/api/v1/metrics/%zz/trends`, authenticated)
      gave a masked 500 and a Sentry event → in scope, added to Phase 1 as D-04;
      `toClientError` in `error.ts`, unit and integration cases, integration case failed with
      500 before the fix
- [x] Found in review: AC-1 tested only GET and POST → PUT, PATCH, DELETE and a wrong method on
      `/api/v1/health` added; the out-of-scope 401-before-404 under an authenticated router is
      pinned by a test

## Acceptance

- [x] AC-1 — integration › unknown routes; unit › not-found
- [x] AC-2 — integration › oversized body
- [x] AC-3 — integration › unsupported charset
- [x] AC-4 — unit › `expose:false` and 5xx stay masked 500 and reach Sentry
- [ ] AC-5 — Phase 2

## Gates

Phase 1, final tree, Node 24.21.0, 2026-09-30.

- [x] typecheck — pass
- [x] lint — pass, 0 warnings
- [x] format — pass
- [x] tests — unit 649 pass (641 + 8 new); integration 213 pass, 5 skipped (202 + 11 new)
- [x] build — pass
- [x] OpenAPI — `docs:openapi:check` pass, no drift (no route or schema touched)
- [x] security delta — skipped, no dependency change
- [x] extra: `contract:local:gate` — pass; seed 42, 42/47 selected, 1444 generated, the 2 known
      warnings

## Docs

- [x] `docs/explanation/architecture/shared-middleware.md` — Not-found row; Error handler row
- [x] `.claude/rules/api-design.md` — chain and status list
- [x] `docs/internal/todos/2026-09-29-todo-error-envelope-residuals.md` — progress note
- [x] `docs/internal/initiatives/feature-boundary-audience-paths/README.md` — merged in #123

## Review

`code-reviewer` pass on Phase 1: 0 critical, 0 warning, 6 suggestions, verdict approve.

- Undecodable path parameter still a masked 500 — reproduced, fixed as D-04 (see Discovered).
- AC-1 methods under-tested — fixed (see Discovered).
- 415 message echoes the client's charset — accepted, recorded under D-02 Consequences.
- Guard destructured before its `instanceof` check — moot: `toClientError` takes an `Error`.
- No integration-level Sentry assertion — not added. The unit tests assert Sentry per mapping, and
  `not-found.test.ts` fails if the handler ever defers to `errorHandler` instead of answering.
- 400 request-aborted covered at unit level only — accepted.
