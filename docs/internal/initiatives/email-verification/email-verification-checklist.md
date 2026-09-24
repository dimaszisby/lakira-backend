# Email Verification — Checklist

## Phase 0 — Schema

- [x] Migration `20260508000001-add-users-email-verified-at.cjs` adding `email_verified_at TIMESTAMPTZ NULL` to `users`. Working `down`.
- [x] Migration `20260508000002-create-email-verification-tokens.cjs` (id UUID PK, user_id FK, token_hash UNIQUE, expires_at, used_at NULL, created_at + index on `(user_id, used_at)`). Working `down`.
- [ ] Run `npm run migrate:dev` and `npm run migrate:test`; verify tables present.

## Phase 1 — Domain

- [x] `EmailVerificationToken.ts` entity (private constructor, `fromPersistence()`, `markUsed()`, `isExpired()`, `isUsable()`).
- [x] `EmailVerificationTokenRepository.ts` interface: `save`, `findByTokenHash`, `findLatestByUserId`, `revokeAllForUser`, `markUsed`.

## Phase 2 — Infrastructure

- [x] Sequelize model `email-verification-token.sequelize.ts` registered in `src/infrastructure/db/models.ts`.
- [x] `EmailVerificationTokenRepositorySequelize.ts` + `EmailVerificationTokenMapper.ts` mirroring the password-reset pattern.
- [x] Email template `email-verification.ts` (subject + plain text + HTML).

## Phase 3 — Application

- [x] `RequestEmailVerification` use case (revoke prior + issue new + send via `EmailSender`).
- [x] `VerifyEmail` use case (hash + lookup + isUsable + set `users.email_verified_at` + markUsed).
- [x] `RegisterUser` calls `RequestEmailVerification(newUserId)` after persistence; controller does fire-and-forget.

## Phase 4 — HTTP

- [x] `POST /api/v1/auth/verify-email` route (public).
- [x] `POST /api/v1/auth/resend-verification` route (JWT-protected).
- [x] `emailVerificationEmailRateLimiter` (3/hour) + `emailVerificationIpRateLimiter` (10/hour).
- [x] `requireVerifiedEmail` middleware created (NOT applied to any existing route).
- [x] Env: `EMAIL_VERIFICATION_TTL_SEC` (default 86400), `FRONTEND_VERIFY_URL` added to `zodEnv.ts`.
- [x] `buildAuthFeature` wires repo + use cases.

## Phase 5 — Tests + OpenAPI

- [x] Unit tests for `RequestEmailVerification`, `VerifyEmail`, and `requireVerifiedEmail` middleware.
- [x] Integration test `__tests__/integration/api/auth-verify.test.ts`: register → POST verify-email → success → re-use → 400.
- [x] Integration test for `/resend-verification` (revoke prior token, silent for verified user).
- [x] `npm run docs:openapi:generate`; verify both routes appear.
- [ ] Auth feature kit README at `docs/internal/initiatives/features/auth/README.md` updated to link this kit.

## Wrap-up

- [ ] `npm run typecheck && npm run lint && npm run format:write && npm test`.
- [ ] Audit re-run shows P1-1.2 marked Pass.
- [ ] Update `iteration-plan.md` Phase 3 status to Pass Done with PR link.
