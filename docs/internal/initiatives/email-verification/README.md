# Email Verification

## Overview

Adds self-service email verification on registration: a one-time, hashed, 24-hour token sent via the existing `EmailSender` port; an `email_verified_at` column on `users`; a `requireVerifiedEmail` middleware to gate sensitive endpoints. Mirrors the existing password-reset flow which is the canonical reference for token-by-email patterns in this codebase.

- **Owning squad / DRI:** @dimaszisby
- **Reference flow:** `docs/internal/initiatives/features/password-reset/` (gold-standard token-by-email kit).
- **Reused infrastructure:** `EmailSender` port (`src/features/shared/auth/application/ports/EmailSender.ts`), `ConsoleEmailSender`, `ResendEmailSender`, `password-reset.ts` template (will get a sibling `email-verification.ts` template).

## Scope

**In scope:**

- `email_verified_at TIMESTAMPTZ NULL` column on `users`.
- `email_verification_tokens` table (mirrors `password_reset_tokens`: id, user_id FK, token_hash UNIQUE, expires_at, used_at, created_at).
- Use cases: `RequestEmailVerification`, `VerifyEmail`. Send-on-register fires `RequestEmailVerification` after `RegisterUser`.
- Routes: `POST /api/v1/auth/verify-email` (consumes token), `POST /api/v1/auth/resend-verification` (rate-limited, requires JWT).
- Middleware `requireVerifiedEmail` for future use; do NOT gate any current endpoint until forks decide which flows need it.
- OpenAPI regen.

**Out of scope:**

- Re-registration / "I lost my verification email": handled by `/resend-verification` only.
- Email-change verification (separate future kit, builds on this).
- Welcome email content design.
- Frontend verification page.

## Commands & Tooling

- `npm run typecheck && npm run lint`
- `npm run test:unit -- email-verification`
- `npm run test:integration -- auth-verify`
- `npm run docs:openapi:generate`

## Verification

- Registering a new user inserts a row in `email_verification_tokens` and sends an email via the configured sender (`ConsoleEmailSender` logs the link in dev/test).
- `POST /auth/verify-email` with the raw token sets `users.email_verified_at = now()` and marks the token used. Reuse returns 400 with the same generic message as invalid/expired (anti-enumeration).
- `POST /auth/resend-verification` rate-limited per email (3/hour) and per IP (10/hour); always returns 200 ("if your email is unverified, we sent a link").
- `requireVerifiedEmail` middleware exists, has a unit test, but is NOT applied to any current route — it's a tool for forkers.

## References

- [Plan](./email-verification-plan.md)
- [Checklist](./email-verification-checklist.md)
- [Decisions](./decisions.md)
- **Closes audit gaps:** [P1-1.2] in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`.
- **Owning ADRs:** ADR-005 (phase order) in `docs/internal/audits/saas-readiness/decisions.md`; (kit-local) ADR-001 (24-hour TTL + anti-enumeration response shape) in `./decisions.md`.
- **Effort:** M.
- **Status:** Done — shipped in #43 (`6d78331`).
- **Predecessor / dependency:** Soft dependency on Phase 1 — the verify-port refactor lands an `InvalidTokenError` pattern that `VerifyEmail` reuses. Can technically ship before Phase 1 completes by inlining the error class.
