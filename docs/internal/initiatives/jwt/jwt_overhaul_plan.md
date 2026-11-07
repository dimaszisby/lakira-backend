# JWT Handling Overhaul Plan

## 1. Context and Goals

The Lakira backend protects every authenticated endpoint with JSON Web Tokens (JWT). Tokens are generated inside the auth feature (`src/utils/token-generator.ts`, `src/features/auth/infrastructure/providers/JwtTokenProvider.ts`) and verified by the shared middleware (`src/features/auth/infrastructure/http/authMiddleware.ts`). Environment variables are validated via `src/config/zodEnv.ts`. We need a production-ready plan that:

- Removes hard-coded secrets from the repository and enforces centralized configuration.
- Hardens signing and verification to align with zero-trust expectations (secure algorithms, rotation, metrics, testing).
- Establishes clear operational practices for issuing, rotating, and revoking tokens through CI/CD and runtime automation.

## 2. Current-State Analysis

| Area                    | Observations                                                                                                                                                                                             | Risk                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Secret sourcing         | Code consistently reads `env.JWT_SECRET`. Zod schema throws at boot if the secret is missing.                                                                                                            | Low                                                                          |
| Secret storage          | Realistic looking secrets are committed under `.env.development` / `.env.test`. No `.env.example` pattern.                                                                                               | High: repo leakage, cannot prove unique-per-environment secrets.             |
| Signing implementation  | `tokenGenerator` and `JwtTokenProvider` sign payload `{ id, email }` with `expiresIn: "7d"` but omit explicit `algorithm`. JSON Web Token defaults to HS256. No issuer/audience/subject claims.          | Medium: defaults can drift, harder to audit, long token lifetime.            |
| Verification            | Middleware calls `jwt.verify` with a single shared secret. No grace period or JWKS support, no clock skew tolerance, error responses are generic 401.                                                    | Medium: rotation downtime, limited observability.                            |
| Configuration surface   | Only one secret value exists. No support for key versioning or per-environment overrides beyond `.env`.                                                                                                  | Medium: rotation requires redeployment and invalidates all tokens instantly. |
| Observability & logging | No structured logging around token failures/suspicious activity.                                                                                                                                         | Medium: harder to detect brute force or replay.                              |
| Tests / CI              | Unit tests mock JWT signing but there is no automated check ensuring `JWT_SECRET` is provided in CI pipelines (depends on manual GitHub Actions config). No secret scanning check for committed secrets. | Medium                                                                       |

## 3. Target State

1. **Secret Hygiene**: No committed secrets. `.env.example` documents placeholders; real values live in secrets managers (GitHub Actions secrets, Vault, AWS Secrets Manager). Automated scanning blocks accidental commits.
2. **Config + Validation**: Dedicated `jwt` config module derived from validated env (secret(s), issuer, audience, algorithm, expiry, clock skew). Startup fails fast if misconfigured.
3. **Key Rotation Support**: Support multiple active secrets (key IDs) to allow staged rotation. Prefer asymmetric algorithms (RS256 / ES256) managed via JWKS to avoid sharing symmetric keys across services.
4. **Improved Token Semantics**: Explicit `iss`, `aud`, `sub`, `iat`, `exp` claims. Configurable lifetimes (access vs refresh). Short-lived access tokens (e.g., 15m) plus optional refresh token strategy.
5. **Observability and Security Controls**: Central logging for auth failures, metrics on token issuance/denials, rate limiting on login, optional IP/user agent binding.
6. **CI/CD Integration**: Pipelines provision secrets securely and run automated guards (secret scanning, env validation tests). Deployment docs describe how to rotate keys without downtime.

## 4. Overhaul Plan

### Phase A – Foundations (Week 1)

1. **Secret Scrub + Policy**
   - Remove committed secrets from `.env.*`. Introduce `.env.example` with placeholders and documentation.
   - Add commit-time/CI secret scanners (e.g., `gitleaks` or `trufflehog`) to prevent regressions.
2. **Central JWT Config Module**
   - Create `src/config/jwtConfig.ts` to surface validated settings (algorithm, issuer, lifetimes, allowed audiences).
   - Update token generator and middleware to import from the config module instead of sprinkling literals.

### Phase B – Token Semantics (Week 2)

1. **Explicit Algorithms + Claims**
   - Update signing to include `issuer`, `audience`, `subject` and enforce `algorithm` option for both `sign` and `verify`.
   - Shorten access-token TTL (e.g., 15 minutes) and introduce refresh tokens with rotation + revocation table if product requirements allow.
2. **Error Handling + Logging**
   - Add structured logs (with redaction) around token failures, include reason codes, and expose metrics (e.g., via Prometheus counters).

### Phase C – Rotation and Operational Hardening (Week 3+)

1. **Key Rotation Mechanism**
   - Support multiple secrets via `kid` header. Consider migrating to asymmetric keys with JWKS endpoint, enabling zero-downtime rotation and limited blast radius.
   - Document rotation runbooks (generate keys, update secret manager, redeploy).
2. **CI/CD & Testing Enhancements**
   - Update GitHub Actions workflow to require `JWT_SECRET` (and future key sets) via environment secrets.
   - Add integration tests ensuring APIs fail fast without secrets and accept/reject tokens according to the new claims policy.
3. **Operational Guardrails**
   - Add alerting when repeated invalid tokens occur.
   - Document incident response for suspected key compromise (revoke tokens, rotate keys, invalidate refresh tokens).

## 5. Deliverables

- Clean `.env` hygiene + documentation.
- Configurable JWT module with multi-key support.
- Revised token issuance & middleware with explicit claims, logging, and observability.
- CI/CD workflows provisioning secrets securely and enforcing validation.
- Runbooks for rotation and incident management.

## 6. Success Metrics

- No committed secrets detected by automated scanners.
- Token lifetime and claims align with documented policy.
- Rotation can occur without downtime, verified via staging exercise.
- Auth-related alerts and dashboards exist for failed verifications and unusual activity.

---

## 7. Phase D — Refresh tokens + verify-port (added 2026-05-02 from SaaS-readiness audit)

This phase closes audit gaps **P0-1.1** (no refresh-token flow) and **P1-10.3** (auth middleware re-implements `jwt.verify` outside the port). It rides on top of Phases A–C above, but does not require them to be complete first — the verify-port refactor and the refresh-token addition are self-contained.

Detailed decisions for this phase live in [`./decisions.md`](./decisions.md) ADR-001 (refresh-token storage) and ADR-002 (verify-port refactor).

### Phase D.1 — TokenProvider.verify() extension

1. Extend the port `src/features/shared/auth/application/ports/TokenProvider.ts` with `verify(token: string): Promise<TokenClaims>`. Define `TokenClaims = { userId, email, iat, exp, kid? }` in a sibling type file.
2. Implement in `src/features/shared/auth/infrastructure/providers/JwtTokenProvider.ts`. Throw a new `InvalidTokenError extends AppError` (401) on any failure (`TokenExpiredError`, `JsonWebTokenError`, malformed claims).
3. Convert `authMiddleware` to a factory: `makeAuthMiddleware(tokenProvider, userRepository)`. Wire from `buildAuthFeature()` in `src/features/shared/auth/feature.ts`. Remove the `import jwt from "jsonwebtoken"` line from `authMiddleware.ts`.
4. Update unit tests under `__tests__/unit/features/auth/` to mock the port. Add a direct `JwtTokenProvider.verify` test covering: valid token, expired token, malformed token, wrong secret.

### Phase D.2 — Refresh-token entity + persistence

1. Migration `src/migrations/YYYYMMDDHHMMSS-create-refresh-tokens.cjs` with the schema in ADR-001 (id, user_id FK, family_id, token_hash UNIQUE, issued_at, expires_at, revoked_at, replaced_by_id, user_agent, ip). Indexes on `(user_id, revoked_at)` and `family_id`. Working `down`.
2. Domain entity at `src/features/shared/auth/domain/entities/RefreshToken.ts` with private constructor, static `issue(userId, familyId?, ttlSec)`, instance methods `markRevoked()`, `replaceWith(newId)`. No JWT logic in this layer.
3. Repository interface `src/features/shared/auth/domain/repositories/RefreshTokenRepository.ts` with: `save(rt)`, `findByTokenHash(hash)`, `revokeFamily(familyId)`, `findActiveByUser(userId)`.
4. Sequelize implementation + mapper following the `PasswordResetToken` reference pattern (`src/features/shared/auth/infrastructure/persistence/`).

### Phase D.3 — Use cases + HTTP route

1. New use cases: `IssueRefreshToken(userId)`, `RotateRefreshToken(rawToken)`, `RevokeRefreshTokenFamily(rawToken)`.
2. `LoginUser` use case grows to also call `IssueRefreshToken` and return the raw refresh token to the controller.
3. Controller writes the refresh token as an HttpOnly Secure SameSite=Lax cookie `lakira_refresh` (Path `/api/v1/auth/refresh`). Reduces the access-token TTL to 15 minutes via a new env `ACCESS_TOKEN_TTL_SEC` defaulting to 900.
4. New route `POST /api/v1/auth/refresh` — reads the cookie (or `Authorization: Bearer <refresh>` fallback), calls `RotateRefreshToken`, sets the new cookie, returns the new access token.
5. `POST /api/v1/auth/logout` switches from a no-op 200 to calling `RevokeRefreshTokenFamily` (closing P0-1.1's "logout doesn't revoke" sub-issue).
6. Add `cookie-parser` dep + middleware in `src/server.ts` before the routes.

### Phase D.4 — Reuse detection + observability

1. `RotateRefreshToken` checks `revoked_at` on the looked-up token. If set, revoke the entire `family_id` and emit a structured log `auth.refresh.reuse_detected` at WARN with `{ userId, familyId, ip, userAgent }`. Respond 401.
2. Counter increment for `auth.refresh.success`, `auth.refresh.reuse_detected`, `auth.refresh.invalid` (uses the existing logger; Prometheus integration deferred to P2-5.4).

### Phase D.5 — OpenAPI + integration tests

1. `npm run docs:openapi:generate` after the new routes land. Verify the `/auth/refresh` route appears with the cookie auth scheme and the 30-day refresh-cookie shape.
2. Integration tests `__tests__/integration/api/auth-refresh.test.ts`: login → refresh succeeds → re-using the original refresh fails 401 + family revoked → logout revokes outstanding refresh → expired access token rejected with 401.
3. Add an explicit test that `grep -n "from \"jsonwebtoken\"" src/features/shared/auth/infrastructure/http/authMiddleware.ts` returns nothing (architecture test in `__tests__/unit/architecture.test.ts` once Phase 5 lands; until then, manual verification).

### Phase D — Risks & rollback

- **Rollback for refresh tokens:** all changes are additive at the schema level. To roll back: deploy a build that ignores the cookie + restores the previous 7-day access-token TTL. Refresh tokens stay in the table but unused.
- **Cookie-domain pitfalls:** if the API and frontend are on different subdomains, set `domain` correctly. Document in `decisions.md` once the production URL is known.
- **Access-token-TTL drop:** going from 7d to 15m exposes any client that previously cached the JWT for hours. Coordinate the FE refresh flow before turning down the TTL; ship the refresh route first, observe one week, then drop the TTL.

### Phase D — Success metrics

- `POST /auth/refresh` works end-to-end in integration tests with rotation + reuse detection.
- `authMiddleware` no longer imports `jsonwebtoken` directly.
- Logout actually revokes (verified by integration test).
- Access-token TTL is 15 minutes in production env.
- Audit re-run marks P0-1.1 and P1-10.3 as Pass.
