# ADR-0057 — Rate limiters answer through the error envelope

- **Status:** Accepted
- **Date:** 2026-10-03
- **Related:** caveat C3, residual 3 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md`
  § 4.1); [ADR-0053](./adr-0053-registration-rate-limited-per-ip.md), whose limiter moves with the
  rest; `.claude/rules/api-design.md` § Response Format
- **Origin:** `D-03`, `D-05` and `D-07` in the error-envelope-residuals kit —
  [`error-envelope-residuals`](../../internal/initiatives/error-envelope-residuals/decisions.md)

---

## Context

Every error body the API sends is `{status: "fail" | "error", message}`, written by `sendError` in
`src/shared/utils/error-envelope.ts`. The rate limiters were the exception. Each of the nine in
`src/shared/middleware/rate-limiter.ts` carried its own `message` object and its own handler, and
answered `429 {"status": 429, "message": "…"}`, with `status` as a number. The OpenAPI spec
documented that shape and called it the one deliberate exception.

The 2026-09-29 audit counted it as the last residual of caveat C3. It also showed how the shape
spread: the ninth limiter, added on 2026-10-02 for registration, was written by copying the eighth.

lakira-frontend generates its types from the spec, so the shape could not change without its
agreement. That was asked on 2026-10-01 and given on 2026-10-03.

## Decision

1. **A throttled request is answered `429 {"status": "fail", "message": "…"}`**, through
   `sendError`. The HTTP status, each limiter's message text, and the `RateLimit-*` headers are
   unchanged.
2. **One helper builds every limiter's answer.** `limitExceeded(message, logLine)` returns the
   `message` and `handler` options together, and each limiter spreads it into its `rateLimit()`
   call. The handler logs `logLine(req)` at `warn` and sends the string it was given.
3. **`express-rate-limit` is imported in `rate-limiter.ts` only.** A limiter defined anywhere else
   would not be seen by the checks below.
4. **The spec documents the envelope.** `RateLimitError` and the `TooManyRequestsError` response
   declare `status` as a string.
5. **The readiness probe is the one named exception.** `GET /api/v1/ready` answers
   `503 {"status": "degraded", "checks": {…}}` when a dependency is down. That is the same document
   as its 200 with different values, read by platform probes and `scripts/image-smoke.sh`, not an
   error a client handles. It stays as it is.

## Options considered

- **Edit the nine handlers in place.** Rejected: the shape would still live in nine places, which
  is how it drifted and how the ninth limiter inherited it.
- **Throw `AppError(429)` into `errorHandler`.** Rejected: that logs every throttled request at
  `error` as `Error Occurred`. The limiter's own `warn` line already names who was throttled.
- **Keep the handlers and pass the envelope as the library's `message` option.** Rejected: the
  body would not go through `sendError`, and the library types that option as `any`, so nothing
  stops an object or a function being put there.
- **Leave it as the documented exception.** Rejected: it is the reason C3 could not be restated as
  closed, and a client that handles errors by the envelope has to special-case one status.
- **Move the readiness 503 into the envelope too.** Rejected: it changes a probe contract for no
  client that reads errors generically.

## Consequences

- **A client that read `status` as the number 429 from the body breaks.** lakira-frontend does not:
  it decides on the HTTP status and reads only `message` from the body. Its generated types change,
  and two of its test fixtures mock the old body. A fork's client should be checked the same way.
- **The login lockout was already in the envelope.** It answers 429 through `AppError`, so nothing
  changes there.
- **The safety is tests, not the type system.** A unit test trips all nine limiters with the real
  library and checks the body, the headers and the log line, and fails if a tenth factory is
  exported without being added to it. An architecture test reads source text: each `rateLimit(`
  call must spread `limitExceeded(` and set no `message` or `handler` of its own, and no file under
  `src/` may write a three-digit 4xx or 5xx number as a body's `status`. An aliased import or a
  renamed helper would get past the text checks; decision 3 narrows where that could happen.
- **The numeric-status check can trip on legitimate code.** A typed result object with a field
  written `status: 404` would fail it. None exists today. If one is needed, name the field
  `statusCode`, as the rest of the code does.
- **Revert-safe.** No migration and no stored data. A revert restores the numeric `status` and
  needs the same frontend spec sync in reverse.

## Links

- Kit: `docs/internal/initiatives/error-envelope-residuals/`
- Helper and limiters: `src/shared/middleware/rate-limiter.ts`
- Envelope: `src/shared/utils/error-envelope.ts`
- Tests: `__tests__/unit/shared/middleware/rate-limiter.envelope.test.ts`;
  `__tests__/unit/architecture.test.ts` › rate limiters answer through the error envelope
