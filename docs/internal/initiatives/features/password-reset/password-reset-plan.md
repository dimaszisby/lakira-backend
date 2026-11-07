# Password Reset — Plan & Ticket

## Summary

Add self-service password recovery to the auth slice using a one-time, hashed, 15-minute token sent via email. Introduces an `EmailSender` port with Resend (prod/staging) and console (dev/test) adapters.

## Background

See [README — Overview](./README.md). Today there is no recovery path and no email infra; this is greenfield within an established DDD slice.

## Acceptance Criteria

**Functional**

- `POST /auth/forgot-password` accepts `{ email }`, always returns 200 + a generic "if an account exists…" message, regardless of whether the email is registered.
- When the email is registered, an email containing a one-time reset link is dispatched via the configured `EmailSender`.
- Each new request invalidates any prior unused tokens for the same user (only one active token per user at a time).
- `POST /auth/reset-password` accepts `{ token, password, passwordConfirmation }`, validates the token (exists, unused, unexpired), updates the user's password hash, marks the token used, returns 200 with no JWT.
- Subsequent use of the same token returns 400 with the same generic error message used for invalid/expired tokens.
- User can immediately authenticate with the new password via `POST /auth/login`.

**Security**

- Raw tokens are never persisted — only the SHA-256 hex digest is stored in `password_reset_tokens.token_hash`.
- Tokens expire 15 minutes after issue.
- Anti-enumeration: identical response shape and timing for known vs. unknown email on `/forgot-password`.
- Rate-limited: max 3 `/forgot-password` per hour per email and max 10 per hour per IP; `/reset-password` rate-limited per IP.
- All error messages on `/reset-password` (token unknown / expired / used / user missing) collapse to one generic 400 to prevent information leak.
- No raw token, no plaintext password, no `RESEND_API_KEY` ever appears in logs (existing redaction regex covers `RESEND_API_KEY`).

**Operational**

- In `development`/`test`, the flow works without any Resend credentials (`ConsoleEmailSender` logs the link).
- Boot-time guard fails fast if `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` is missing.
- DB migration is reversible (working `down`).
- OpenAPI spec regenerated to include the two new routes.

**Quality gates**

- `npm run lint && npm run typecheck` clean.
- Unit tests cover use-case happy/sad paths.
- Integration tests cover the two new HTTP endpoints incl. rate limiting and method-not-allowed.
- Doc kit at `docs/internal/initiatives/features/password-reset/` exists with README, plan, checklist, and at least one ADR.

## Phases / Milestones

1. **Phase 0 — Documentation kit** (this file + sibling files).
2. **Phase 1 — Schema & domain** — migration, `PasswordResetToken` entity, repo interface.
3. **Phase 2 — Email infrastructure** — `EmailSender` port, Console + Resend adapters, template.
4. **Phase 3 — Application use cases** — `RequestPasswordReset`, `ResetPassword` + unit tests.
5. **Phase 4 — HTTP & DI wiring** — schemas, controllers, routes, rate limiters, `feature.ts` wiring, env schema.
6. **Phase 5 — Integration tests + OpenAPI regen** — end-to-end coverage; regenerate spec.
7. **Phase 6 — Manual QA + readme refresh** — flow walk-through; update `Last updated` date.

## Success Metrics

- All acceptance criteria checked.
- `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration` green on the feature branch.
- Manual flow completes end-to-end on local `EMAIL_PROVIDER=console`.

## Risks & Trade-offs

| Risk                                                                    | Mitigation                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email send failure leaks information through response timing            | Send happens after the response decision is made; failures are logged, not raised. The 200 response shape is identical regardless.                      |
| Token brute-forcing                                                     | 256-bit token (`crypto.randomBytes(32)`) + 15-min TTL + per-IP rate limit + single-use. Probability of guess ~ negligible.                              |
| `RESEND_API_KEY` accidentally logged                                    | Existing redaction regex (`/(password\|secret\|token\|key\|certificate\|url)$/i`) covers it.                                                            |
| Race condition: two concurrent requests both invalidate + insert        | Acceptable — last writer wins; both tokens become unused/active briefly, but the older one is then invalidated on the next request. No security impact. |
| Resend sandbox restricts `to:` to verified self-email                   | Documented in README; no impact on dev/test (uses console). Domain verification is a follow-up runtime task.                                            |
| Future second email feature triggers premature `EmailSender` extraction | Explicitly deferred — extract to `src/shared/` only when the second user lands.                                                                         |

## Out of Scope

- JWT/session revocation on password change.
- Welcome / email-verification emails.
- Frontend reset page.
- Resend custom domain + DNS verification.

## Dependencies / Stakeholders

- Single developer (@dimaszisby).
- New npm dep: `resend`.
- Resend free-tier account creation (runtime task, blocking only for staging deploy).

## Open Questions

_None — all clarifying questions answered before plan finalization._
