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

## Phase 2 — 429 envelope

Q-1 answered 2026-10-03 (see the plan). The four items written on 2026-09-30 are expanded below;
`frontend-note.md` is replaced by a Notion record (D-06).

- [x] Branch `fix/error-envelope-residuals-429` off `origin/dev` at `b1398cc`, `--no-track`; HEAD
      and upstream verified
- [x] Plan: Q-1 answered; AC-6 and AC-7 added; `decisions.md` D-05, D-06
- [x] `__tests__/unit/shared/middleware/rate-limiter.envelope.test.ts` — real `express-rate-limit`,
      table-driven over all nine `create*RateLimiter` factories with the limit mocked to 1: the
      second request is `429 {status: "fail", message}` with that limiter's own text and the
      `RateLimit-*` headers
- [x] The new test shown failing on the pre-fix source — 9 of 9 limiter cases failed, each
      receiving `"status": 429`
- [x] `src/shared/middleware/rate-limiter.ts` — `limitExceeded(message, logLine)` via `sendError`,
      spread into all nine limiters (D-05, revised in review)
- [x] `__tests__/unit/shared/middleware/rate-limiter.test.ts` and
      `register-rate-limiter.trip.test.ts` — assertions updated to the envelope body
- [x] `__tests__/unit/architecture.test.ts` — every `rateLimit(` call in `src/` spreads
      `limitExceeded(` and sets no `message` or `handler` of its own; `express-rate-limit` imported
      in `rate-limiter.ts` only; no numeric 4xx/5xx `status` written into a body in `src/`
- [x] `src/lib/openapi/openapi-schemas.ts` — `RateLimitErrorSchema.status` a string, example
      `"fail"`
- [x] `src/lib/openapi/openapi-config.ts` — `TooManyRequestsError.status` a string, example
      `"fail"`; the "one deliberate exception" comment removed
- [x] `docs/reference/api/lakira-backend-openapi.json` regenerated and valid
- [x] D-03, D-05 and D-07 promoted to ADR-0057
- [x] Notion "FE and BE messages", Part 2 — the existing record "Rate-limit (429) body moves into
      the error envelope" updated with the answer and the post-merge actions (D-06)

## Discovered

- [x] Found in review: an undecodable path parameter (`/api/v1/metrics/%zz/trends`, authenticated)
      gave a masked 500 and a Sentry event → in scope, added to Phase 1 as D-04;
      `toClientError` in `error.ts`, unit and integration cases, integration case failed with
      500 before the fix
- [x] Found in review: AC-1 tested only GET and POST → PUT, PATCH, DELETE and a wrong method on
      `/api/v1/health` added; the out-of-scope 401-before-404 under an authenticated router is
      pinned by a test
- [x] Found in Phase 2 review: `GET /api/v1/ready` answers `503 {status: "degraded", checks}`,
      a non-2xx body outside the envelope → in scope as a decision, not a code change: named as
      the one exception (D-07, ADR-0057)
- [x] Found in Phase 2 review: the handler read `options.message as string`, an unchecked cast on
      an option the library types as `any` → in scope, the helper now owns the message (D-05)
- [x] Found in Phase 2: `npm run docs:openapi:check` exits 1 on a branch whose spec change is
      intended and not yet committed, because it diffs against the last commit → no change; the
      gate is reported as generate and validate passing plus a byte-identical second generation

## Acceptance

- [x] AC-1 — integration › unknown routes; unit › not-found
- [x] AC-2 — integration › oversized body
- [x] AC-3 — integration › unsupported charset
- [x] AC-4 — unit › `expose:false` and 5xx stay masked 500 and reach Sentry
- [x] AC-5 — unit › `rate-limiter.envelope.test.ts` (all nine, real `express-rate-limit`); spec
      regenerated and valid; live run: second `POST /api/v1/auth/register` at a limit of 1 gave
      `429 {"status":"fail",…}` with `RateLimit-*` headers
- [x] AC-6 — unit › `architecture.test.ts` › rate limiters answer through the error envelope;
      shown failing on a throwaway old-shape limiter in `src/`
- [x] AC-7 — Notion record "Rate-limit (429) body moves into the error envelope"

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

### Phase 2

Final tree, Node 24.21.0, 2026-10-03.

- [x] typecheck — pass
- [x] lint — pass, 0 warnings
- [x] format — pass
- [x] tests — unit 705 pass (689 + 16 new); integration 219 pass, 5 skipped
- [x] build — pass
- [x] OpenAPI — generate and validate pass (47 operations, 50 schemas); a second generation is
      byte-identical; the diff is the two 429 `status` definitions, number to string.
      `docs:openapi:check` itself exits 1 until the regenerated spec is committed (see Discovered)
- [x] security delta — skipped, no dependency change
- [x] image smoke — skipped, no `Dockerfile`, `.dockerignore` or dependency change
- [x] extra: `contract:local:gate` — pass; seed 42, 42/47 selected, 1443 generated, the 2 known
      warnings

## Docs

- [x] `docs/explanation/architecture/shared-middleware.md` — Not-found row; Error handler row
- [x] `.claude/rules/api-design.md` — chain and status list
- [x] `docs/internal/todos/2026-09-29-todo-error-envelope-residuals.md` — progress note
- [x] `docs/internal/initiatives/feature-boundary-audience-paths/README.md` — merged in #123

### Phase 2

- [x] `docs/explanation/decisions/adr-0057-rate-limiters-answer-through-the-error-envelope.md`;
      registry row; next free number ADR-0058
- [x] `adr-0053-registration-rate-limited-per-ip.md` — status note pointing at ADR-0057
- [x] `.claude/rules/api-design.md` — limiters answer with the envelope; the readiness exception
- [x] `docs/explanation/architecture/shared-middleware.md` — Rate limiting row
- [x] `CLAUDE.md` — ADR count 57
- [x] `docs/internal/todos/2026-09-29-todo-error-envelope-residuals.md` — Fixed
- [x] `FINAL-AUDIT-SUMMARY.md` — "C3 — fix landed, not yet re-audited" note; § 8 item 7 update
- [x] `SAAS-BASE-CHECKLIST.md` — C3 gap marked fixed, pending a dated run
- [x] `docs/internal/initiatives/worker-composition-root/README.md` — merged in #130

## Review

`code-reviewer` pass on Phase 1: 0 critical, 0 warning, 6 suggestions, verdict approve.

- Undecodable path parameter still a masked 500 — reproduced, fixed as D-04 (see Discovered).
- AC-1 methods under-tested — fixed (see Discovered).
- 415 message echoes the client's charset — accepted, recorded under D-02 Consequences.
- Guard destructured before its `instanceof` check — moot: `toClientError` takes an `Error`.
- No integration-level Sentry assertion — not added. The unit tests assert Sentry per mapping, and
  `not-found.test.ts` fails if the handler ever defers to `errorHandler` instead of answering.
- 400 request-aborted covered at unit level only — accepted.

### Phase 2

`code-reviewer` pass on Phase 2: 0 critical, 4 warnings, 1 suggestion. Each was checked against the
code.

- Unchecked `options.message as string` cast — confirmed, fixed: the helper owns the message (D-05).
- Architecture guard could be fooled by counting (a stray `handler: limitExceeded(` cancelling a
  missing one; `rateLimit(options)` never counted) — confirmed, fixed: each call is checked on its
  own, and the library may be imported in one file only. An aliased import or a renamed helper
  still gets past it; ADR-0057 says so.
- `GET /api/v1/ready` 503 body is outside the envelope — confirmed, recorded as the named exception
  (D-07).
- The new test asserted that a warning was logged but not its text, and compared the body with
  `toEqual` — fixed: each limiter's log line is asserted and the body uses `toStrictEqual`. The
  signed-in branches of the log lines stay covered by `rate-limiter.test.ts`.
- Rename the helper's `describe` parameter — done (`logLine`).
- No behaviour drift found in the nine limiters: windows, limits, keys, message text and log text
  were compared line by line.
