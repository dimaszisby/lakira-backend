# Todo — error responses that still bypass the envelope

- **Status:** Fixed in kit
  [`error-envelope-residuals`](../initiatives/error-envelope-residuals/README.md). Phase 1 (#124,
  `7ea5ec6`) fixed the unknown-route 404 and the body-parser 4xx. Phase 2 (#131, `582c1b5`,
  ADR-0057) moved every limiter onto the envelope. **Confirmed by the dated run of 2026-10-03**: C3
  is closed-confirmed.
- **Created:** 2026-09-29
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-09-29.md` §4.1 C3; kit `saas-gold-reaudit` D-05

---

## What

Reproduced on 2026-09-29 against `src/server.ts`:

- An unknown route returns Express's HTML 404. No not-found handler runs before `errorHandler`
  (`server.ts:235`).
- An oversized body and an unsupported charset return a masked `500`, and are sent to Sentry.
  body-parser's errors are not `SyntaxError`, so `error.ts:81-88` maps them to 500.
- Every rate limiter answers `{status: 429, message}` with a numeric `status`
  (`rate-limiter.ts:45-56`), and the spec documents that divergent shape.

## Suggested fix

A JSON not-found handler; map http-errors with `expose && status < 500` to `AppError(status)`;
limiters through `sendError`. The 429 schema change alters lakira-frontend's generated types, so
it needs an ADR and a cross-repo note.
