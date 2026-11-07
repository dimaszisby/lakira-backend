# Password Reset — Checklist

## Phase 0 — Documentation Kit

- [x] Create `docs/internal/initiatives/features/password-reset/` folder
- [x] Write `README.md`
- [x] Write `password-reset-plan.md`
- [x] Write `password-reset-checklist.md` (this file)
- [x] Write `decisions.md` with ADR-001 (storage hashing) + ADR-002 (anti-enumeration response shape) + ADR-003 (adapter selection by env)

## Phase 1 — Schema & Domain

- [x] Add migration `src/migrations/20260424000000-create-password-reset-tokens.cjs` (UUID PK, FK→users CASCADE, unique `token_hash`, `(user_id, used_at)` index, `expires_at`, `used_at`, timestamps)
- [x] Verify `npm run db:migrate:test` applies and creates the table
- [x] Domain entity `src/features/auth/domain/entities/PasswordResetToken.ts` (private ctor, `fromPersistence`, `markUsed`, `isExpired`, `isUsed`)
- [x] Repo interface `src/features/auth/domain/repositories/PasswordResetTokenRepository.ts` (`findByTokenHash`, `create`, `markUsed`, `invalidateAllForUser`)

## Phase 2 — Email Infrastructure

- [x] Port `src/features/auth/application/ports/EmailSender.ts`
- [x] `src/features/auth/infrastructure/providers/ConsoleEmailSender.ts` (Winston `[EMAIL:CONSOLE]` log)
- [x] `npm i resend` and add to `dependencies`
- [x] `src/features/auth/infrastructure/providers/ResendEmailSender.ts` (constructor `apiKey`, `from`)
- [x] Template `src/features/auth/infrastructure/email/templates/password-reset.ts` (HTML-escapes link)

## Phase 3 — Application Use Cases + Unit Tests

- [x] Sequelize model `src/features/auth/infrastructure/persistence/models/password-reset-token.sequelize.ts` + register via existing `registerAuthModels` / `associateAuthModels`
- [x] `src/features/auth/infrastructure/mappers/PasswordResetTokenMapper.ts`
- [x] `src/features/auth/infrastructure/persistence/PasswordResetTokenRepositorySequelize.ts`
- [x] `src/features/auth/application/use-cases/RequestPasswordReset.ts`
- [x] `src/features/auth/application/use-cases/ResetPassword.ts`
- [x] `__tests__/unit/features/auth/application/RequestPasswordReset.test.ts` — happy, unknown email (no send, no row), send failure swallowed, prior-token invalidation
- [x] `__tests__/unit/features/auth/application/ResetPassword.test.ts` — happy, mismatched confirmation, expired/used/unknown token (all collapse to one error), missing user collapses to same error

## Phase 4 — HTTP & DI Wiring

- [x] Add to `src/config/zodEnv.ts`: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_RESET_URL`, `RATE_LIMIT_PASSWORD_RESET_EMAIL_MAX`, `RATE_LIMIT_PASSWORD_RESET_IP_MAX`
- [x] Add `createPasswordResetEmailRateLimiter()` + `createPasswordResetIpRateLimiter()` to `src/shared/middleware/rate-limiter.ts`
- [x] Add `forgotPasswordSchema`, `resetPasswordSchema` to `src/features/auth/infrastructure/http/schema.zod.ts`
- [x] Add controllers `forgotPassword`, `resetPassword` to `src/features/auth/infrastructure/http/controller.ts`
- [x] Add routes + `methodNotAllowed` guards to `src/features/auth/infrastructure/http/router.ts`
- [x] Wire new use cases + adapter selection in `src/features/auth/feature.ts` (boot-time guard for missing `RESEND_API_KEY` when `EMAIL_PROVIDER=resend`)

## Phase 5 — Integration Tests + OpenAPI

- [x] `__tests__/integration/api/auth-password-reset.test.ts`:
  - [x] forgot with registered email → 200 + token row in DB
  - [x] forgot with unknown email → 200 + zero token rows
  - [x] two consecutive forgots → only latest token unused
  - [x] reset with valid token → 200, password changed, token used; replay → 400
  - [x] reset with expired token → 400 (manipulate `expires_at` directly)
  - [x] method-not-allowed on both routes
  - [x] mismatched password/confirmation → 400
  - [x] unknown token → same generic 400
- [x] Register OpenAPI paths for both endpoints (in `src/lib/openapi/openapi-docs.ts` + schemas in `openapi-schemas.ts`)
- [x] `npm run docs:openapi:generate` — verify diff includes new routes; commit the regenerated spec

## Phase 6 — Manual QA + Doc Refresh

- [ ] Local end-to-end: register → forgot → copy token from console log → reset → login with new password (deferred — covered by green integration tests against real PostgreSQL; perform before staging deploy)
- [x] Update `README.md` `Last updated` date
- [ ] (Pre-staging) Set `RESEND_API_KEY` + flip `EMAIL_PROVIDER=resend`; send a real test email to verified inbox

## Final gates

- [x] `npm run lint && npm run typecheck` clean
- [x] `npm run test:unit && npm run test:integration` green (249 unit + 116 integration tests, all pass)
- [x] `npm run format:check` clean
- [ ] PR opened against `dev` (per branch promotion model: feature → dev → staging → main)
