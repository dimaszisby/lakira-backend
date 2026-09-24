# ADR-0019 — Refresh-token storage and rotation strategy

- **Status:** Accepted (2026-09-24 — implementation verified in code; see the status note)
- **Date:** 2026-05-02
- **Related:** Revised by [ADR-0043](./adr-0043-session-issuance-at-every-authenticated-entry-point.md) (registration also issues a refresh token).
- **Origin:** `ADR-001` in the JWT kit — [`jwt`](../../internal/initiatives/jwt/decisions.md)

> **Status note (2026-09-24).** Moved from Proposed by the `docs-sweep` kit
> ([D-03](../../internal/initiatives/docs-sweep/decisions.md)): the decision below is in the code.
> Evidence: `refresh_tokens` table (`20260503000000-create-refresh-tokens.cjs`), opaque rotating
> tokens with family revocation on reuse, `POST /auth/refresh`, logout revokes the family,
> `REFRESH_TOKEN_TTL_DAYS` default 30, `ACCESS_TOKEN_TTL_SEC` default 900.
> **Differs from point 3:** the cookie is `SameSite=Strict`, not `Lax`, and is named
> `<app>_refresh` (`controller.ts`). Registration was later added to the issuing endpoints by
> [ADR-0043](./adr-0043-session-issuance-at-every-authenticated-entry-point.md).

---

## Context

Audit gap [P0-1.1] requires a refresh-token flow. The current state is a 7-day non-rotating bearer JWT with a no-op logout. We need to decide where refresh tokens live, how rotation is detected, and how revocation cascades.

## Decision

1. **Persistence:** PostgreSQL table `refresh_tokens` with columns `id (UUID PK)`, `user_id (FK users)`, `family_id (UUID, NOT NULL)`, `token_hash (varchar 64, sha256 of the raw token, UNIQUE)`, `issued_at`, `expires_at`, `revoked_at NULL`, `replaced_by_id (FK self, nullable)`, `user_agent`, `ip`. Indexed on `(user_id, revoked_at)` and on `family_id`.
2. **Format on the wire:** opaque random `base64url(crypto.randomBytes(64))` — NOT a JWT. Reasons: (a) we never need to inspect the refresh token without a DB hit anyway, (b) revocation is immediate and database-authoritative, (c) keeps the JWT layer scoped to short-lived access tokens.
3. **Delivery:** HttpOnly + Secure + SameSite=Lax cookie named `lakira_refresh`. Path `/api/v1/auth/refresh`. Lifetime: 30 days (configurable via `REFRESH_TOKEN_TTL_DAYS`).
4. **Rotation:** every successful `/auth/refresh` revokes the presented token (`revoked_at = now()`, `replaced_by_id = newId`) and issues a new pair. The new refresh inherits the `family_id`.
5. **Reuse detection:** if a refresh token presented to `/auth/refresh` has `revoked_at IS NOT NULL`, treat as theft → revoke the **entire family** (UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL) and respond 401. Logged as `auth.refresh.reuse_detected`.
6. **Logout:** `POST /auth/logout` revokes the family of the presented refresh token (or the refresh token resolvable from the cookie).
7. **Access-token TTL** drops from 7 days to 15 minutes once refresh tokens land.

## Options considered

- _Refresh tokens as JWTs._ Rejected: (a) revocation requires a denylist anyway, so the self-contained property is wasted; (b) JWT structure leaks claims that the client need not see.
- _Redis-only storage._ Rejected: refresh tokens are durable user state, not session cache; losing Redis losing logins is unacceptable.
- _No family-ID; revoke single token on reuse._ Rejected: a stolen refresh token + a legitimate refresh in flight produces a race where the attacker keeps a valid chain. Family-revoke kicks both out.
- _Bearer header instead of cookie._ Considered. Cookie wins for browsers (HttpOnly defeats XSS-leak); for API-only clients the same endpoint can accept `Authorization: Bearer <refresh>` as a fallback. Decision: cookie primary, header fallback.

## Consequences

- One new migration: `YYYYMMDDHHMMSS-create-refresh-tokens.cjs` with a working `down`.
- New ports/adapters: `RefreshTokenRepository`, `RefreshTokenRepositorySequelize`, `RefreshTokenMapper`.
- New use cases: `IssueRefreshToken`, `RotateRefreshToken`, `RevokeRefreshTokenFamily`. Existing `LoginUser` use case grows to also call `IssueRefreshToken`.
- `cookie-parser` becomes a real dependency (not currently installed; `package.json` deps inspected during audit).
- `authMiddleware` itself does not change for refresh — it still validates access tokens. The `/auth/refresh` route is unauthenticated (the cookie is the auth).

## Links

- `audit-2026-05-01.md` § [P0-1.1] in `docs/internal/audits/saas-readiness/`
- `src/features/shared/auth/application/ports/TokenProvider.ts` (port to extend)
- `src/features/shared/auth/infrastructure/providers/JwtTokenProvider.ts` (adapter to extend)

---
