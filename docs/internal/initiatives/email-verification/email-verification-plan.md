# Email Verification — Plan

## Context & Goals

Audit gap [P1-1.2]: there is no `email_verified_at` column, no verification token entity, and no `/auth/verify-email` route. New users immediately have a usable account. Forks adding billing, abuse handling, or any flow that assumes "this email belongs to this user" hit this wall.

Goal: greenfield email-verification flow that mirrors the existing password-reset pattern as closely as possible, so reading either kit teaches the other.

## Acceptance Criteria

**Functional**

- `POST /auth/register` returns 201 as today, AND triggers an email-verification token issuance + email send.
- `POST /auth/verify-email` accepts `{ token }`, validates (exists, unused, unexpired), sets `users.email_verified_at = now()`, marks the token used. Returns 200 with no JWT.
- `POST /auth/resend-verification` accepts no body, requires JWT, throttles per email + IP, sends a fresh token only if the user is unverified.
- A new `requireVerifiedEmail` middleware exists in `src/features/shared/auth/infrastructure/http/`. Not applied to any route yet; documented for forks.

**Security**

- Raw tokens are never persisted — only the SHA-256 hex digest in `email_verification_tokens.token_hash`.
- Tokens expire 24 hours after issue (longer than password reset because users open mail at variable cadences; ADR-001).
- Anti-enumeration: identical 200 + generic message on `/resend-verification` for verified vs. unverified vs. unknown user (when the request is missing JWT it 401s; when it has JWT, the response shape is uniform).
- All error messages on `/verify-email` (invalid / expired / used) collapse to one generic 400.
- No raw token, no `RESEND_API_KEY` ever in logs (existing redaction regex covers `RESEND_API_KEY`; redactor kit Phase 0 generalizes the protection).

**Operational**

- In dev/test, the flow works without Resend creds (`ConsoleEmailSender` logs the link).
- Boot fails fast if `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` is missing (already enforced by env validation).
- DB migration is reversible.
- OpenAPI spec regenerated.

**Quality gates**

- Lint, typecheck, unit, integration tests green.

## Phases / Milestones

### Phase 0 — Schema

1. Migration `YYYYMMDDHHMMSS-add-users-email-verified-at.cjs` adding `email_verified_at TIMESTAMPTZ NULL` to `users`. No backfill for existing users (forkers can choose to backfill or to require verification on next login).
2. Migration `YYYYMMDDHHMMSS-create-email-verification-tokens.cjs` creating the table mirroring `password_reset_tokens` (id UUID PK, user_id FK, token_hash UNIQUE, expires_at, used_at NULL, created_at). Index on `(user_id, used_at)`.

### Phase 1 — Domain

1. `src/features/shared/auth/domain/entities/EmailVerificationToken.ts` — private constructor + static `issue(userId, ttlSec = 86400)` + `markUsed()` + `isExpired(now)` + `isUsable(now)`.
2. `src/features/shared/auth/domain/repositories/EmailVerificationTokenRepository.ts` interface: `save(token)`, `findByTokenHash(hash)`, `revokePrior(userId)` (mark all unused-active tokens used).

### Phase 2 — Email infrastructure

1. New template at `src/features/shared/auth/infrastructure/email/templates/email-verification.ts` (subject + plain text + HTML) following the `password-reset.ts` pattern.
2. Reuse the existing `EmailSender` port + `ConsoleEmailSender` + `ResendEmailSender`. No new adapters.

### Phase 3 — Application use cases

1. `RequestEmailVerification(userId)` — generate raw token (`crypto.randomBytes(32)`), hash with SHA-256, persist, send email. Always revokes prior unused tokens for that user before issuing.
2. `VerifyEmail({ rawToken })` — hash, look up, validate (`isUsable`), set `users.email_verified_at`, `markUsed()`.
3. `RegisterUser` use case (existing) gains a hook to call `RequestEmailVerification(newUserId)` after persisting the new user. The dispatch is fire-and-forget at the controller layer (does not block the 201 response).

### Phase 4 — HTTP

1. New routes in `src/features/shared/auth/infrastructure/http/router.ts`:
   - `POST /auth/verify-email` — public (no JWT).
   - `POST /auth/resend-verification` — JWT-protected.
2. New rate limiters in `src/shared/middleware/rate-limiter.ts`:
   - `emailVerificationEmailRateLimiter` — 3/hour by email.
   - `emailVerificationIpRateLimiter` — 10/hour by IP.
3. New `requireVerifiedEmail` middleware in `src/features/shared/auth/infrastructure/http/`. Not applied to any current route — it lives as a tool. Documented in the kit README and in the auth feature's README.
4. New env vars in `src/config/zodEnv.ts`: `EMAIL_VERIFICATION_TTL_SEC` (default 86400), `FRONTEND_VERIFY_URL` (default `${FRONTEND_RESET_URL}/../verify-email` derived).
5. `feature.ts` (`buildAuthFeature`) wires the new repo + use cases.

### Phase 5 — Tests + OpenAPI

1. Unit tests: `RequestEmailVerification` (token issued, prior revoked, email sent), `VerifyEmail` (happy path, expired, used, unknown).
2. Integration tests: register → email logged → POST /verify-email succeeds → second use returns 400; resend-verification respects rate limits.
3. `npm run docs:openapi:generate` — verify both routes and the response envelopes appear in the spec.
4. Update auth feature kit README at `docs/internal/initiatives/features/auth/` with a paragraph pointing here.

## Risks & Trade-offs

| Risk                                                          | Mitigation                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Bulk-register attackers floodfill `email_verification_tokens` | Per-IP register rate limit (existing) + this kit only inserts one row per register call.    |
| Send failure on register breaks 201                           | Email send is fire-and-forget after the response decision. Failures are logged, not raised. |
| Race condition: two concurrent resend requests                | Acceptable — older tokens are revoked when a new one is issued.                             |
| User changes email later                                      | Out of scope. Email-change verification is a separate kit.                                  |
| Forkers gate the wrong endpoint with `requireVerifiedEmail`   | Document the middleware as opt-in; do not apply to any current route.                       |

## Out of Scope

- Email-change flow.
- Welcome / onboarding emails.
- Frontend verification page.
- Mandatory verification (gating endpoints) — the middleware exists but is not applied; that decision belongs to forks.

## Success Metrics

- All acceptance criteria checked.
- Lint/typecheck/test green on the feature branch.
- Audit re-run marks P1-1.2 as Pass.
