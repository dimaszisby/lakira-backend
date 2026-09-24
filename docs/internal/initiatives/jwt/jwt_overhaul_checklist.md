# JWT Overhaul Checklist

## Phase A – Foundations

- [ ] Remove committed secrets from `.env.development`, `.env.test`, `.env.staging`, `.env.production`; replace with `.env.example` (placeholders only).
- [ ] Add secret-scanning tool (e.g., `gitleaks`) to CI and pre-commit hooks with allowlists for intentional patterns.
- [ ] Create `src/config/jwtConfig.ts` exposing validated settings (secret(s), issuer, audience, algorithm, TTLs, clock skew).
- [ ] Update `tokenGenerator`, `JwtTokenProvider`, and `authMiddleware` to consume the centralized config module.

## Phase B – Token Semantics

- [ ] Configure `jwt.sign` / `jwt.verify` with explicit `algorithm`, `issuer`, `audience`, and `subject`.
- [x] Adjust lifetimes (short-lived access token + optional refresh token) and document policy. — Phase D, #41 (ADR-0019)
- [x] Implement refresh-token store (DB/Redis) with rotation & revocation handling if product scope allows. — Phase D, #41 (ADR-0019)
- [ ] Add structured logging + metrics for token issuance, verification failures, and refresh operations.

## Phase C – Rotation & Operations

- [ ] Extend config to support multiple secrets / key IDs; emit `kid` in tokens.
- [ ] Implement key-rotation flow (load active + next keys, verify by `kid`, document runbook).
- [ ] Evaluate migration to asymmetric signing (RS256/ES256) and optional JWKS endpoint.
- [ ] Update GitHub Actions workflow to provision secrets via environment/organization secrets and fail fast if missing.
- [ ] Add automated tests covering missing secret behavior, invalid claims, rotation, and refresh logic.
- [ ] Create monitoring + alerting rules for repeated token failures or suspicious refresh attempts.

## Phase D – Refresh tokens + verify-port (closes P0-1.1, P1-10.3)

### D.1 — TokenProvider.verify() extension

- [x] Extend `TokenProvider` port with `verify(token): Promise<TokenClaims>` and `TokenClaims` type.
- [x] Implement `JwtTokenProvider.verify`; throw new `InvalidTokenError extends AppError` (401) on failure.
- [x] Convert `authMiddleware` to factory `makeAuthMiddleware(tokenProvider, userRepository)`; wire from `buildAuthFeature`.
- [x] Remove `import jwt from "jsonwebtoken"` from `authMiddleware.ts`.
- [x] Update unit tests to mock the port; add direct `JwtTokenProvider.verify` test (valid / expired / malformed / wrong secret).

### D.2 — Refresh-token entity + persistence

- [x] Migration `20260503000000-create-refresh-tokens.cjs` with schema per `decisions.md` ADR-001 (id, user_id FK, family_id, token_hash UNIQUE, issued_at, expires_at, revoked_at, replaced_by_id, user_agent, ip + indexes). Working `down`.
- [x] Domain entity `RefreshToken.ts` with private constructor, static `issue()`, methods `markRevoked()`, `replaceWith()`.
- [x] Repository interface `RefreshTokenRepository`; methods `save`, `findByTokenHash`, `revokeFamily`, `findActiveByUser`.
- [x] `RefreshTokenRepositorySequelize` + `RefreshTokenMapper` mirroring the `PasswordResetToken` pattern.

### D.3 — Use cases + HTTP route

- [x] Use cases `IssueRefreshToken`, `RotateRefreshToken`, `RevokeRefreshTokenFamily` + unit tests.
- [x] Update `LoginUser` to call `IssueRefreshToken`; return the raw refresh token to controller.
- [x] Add `ACCESS_TOKEN_TTL_SEC` (default 900) and `REFRESH_TOKEN_TTL_DAYS` (default 30) to `zodEnv.ts`.
- [x] Install `cookie-parser`; wire `cookieParser()` middleware in `src/server.ts` before routes.
- [x] Login controller writes `lakira_refresh` cookie (HttpOnly, Secure, SameSite=Lax, Path `/api/v1/auth/refresh`).
- [x] New route `POST /api/v1/auth/refresh` reading cookie (with `Authorization: Bearer <refresh>` fallback).
- [x] `POST /api/v1/auth/logout` calls `RevokeRefreshTokenFamily`.

### D.4 — Reuse detection + observability

- [x] `RotateRefreshToken` checks `revoked_at`; if set, revoke entire family + emit `auth.refresh.reuse_detected` WARN log + return 401.
- [x] Counter increments for `auth.refresh.success`, `auth.refresh.reuse_detected`, `auth.refresh.invalid` via Winston meta (Prometheus deferred).

### D.5 — OpenAPI + integration tests

- [x] `npm run docs:openapi:generate`; verify `/auth/refresh` appears with cookie auth scheme.
- [x] Integration test `__tests__/integration/api/auth-refresh.test.ts`: login → refresh succeeds → re-use original refresh fails 401 + family revoked → logout revokes outstanding refresh → expired access token rejected.
- [x] Manual verification: `grep "from \"jsonwebtoken\"" src/features/shared/auth/infrastructure/http/authMiddleware.ts` returns nothing.
- [ ] Audit re-run shows P0-1.1 and P1-10.3 marked ✅.
