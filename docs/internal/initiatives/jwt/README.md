# JWT Lifecycle & Refresh Tokens

## Overview

This kit owns all JSON Web Token concerns for the Lakira backend: signing, verification, secret rotation, refresh-token issuance/rotation/revocation, and the `TokenProvider` port boundary. It absorbs the existing JWT overhaul plan (Phases A–C, secret hygiene + claims hardening + key rotation) and extends it with a new phase for refresh tokens, which is the action item from the SaaS-readiness audit.

- **Owning squad / DRI:** @dimaszisby
- **Reference auth feature:** `src/features/shared/auth/`
- **Port being hardened:** `src/features/shared/auth/application/ports/TokenProvider.ts`
- **Adapter being extended:** `src/features/shared/auth/infrastructure/providers/JwtTokenProvider.ts`
- **Middleware that must change:** `src/features/shared/auth/infrastructure/http/authMiddleware.ts`

## Scope

**In scope:**

- Token signing (claims, algorithm, TTL).
- Token verification (move from inline `jwt.verify` in middleware to `TokenProvider.verify()` port method).
- Refresh-token entity + repository + migration; `/auth/refresh` route with rotation + family-ID revocation.
- Secret rotation support (`kid` header, multi-active-secret config).
- Logout that actually revokes (`POST /auth/logout` revokes the refresh-token family).
- Observability: structured logs + counters around token failures.

**Out of scope:**

- OAuth / social login (P2-1.4 — separate future kit).
- Email verification (Phase 3, separate kit, but it consumes the verify-port extension landed here).
- Multi-tenancy claims (`organizationId` claim) — added in Phase 4's kit, not here.
- Frontend cookie handling.

## Commands & Tooling

- `npm run typecheck && npm run lint`
- `npm run test:unit -- token`
- `npm run test:integration -- auth`
- `npm run docs:openapi:generate` (refresh-token routes change the spec)
- Future secret-scanner (e.g., `gitleaks`) — wired in Phase A of the existing plan.

## Verification

- All unit tests pass for `JwtTokenProvider.sign`, `JwtTokenProvider.verify`, `RefreshTokenRepository`, and the new `RefreshTokens` use case.
- Integration: register → login → access token expires (15 min mocked) → refresh succeeds → reuse same refresh token returns 401 + revokes family → logout revokes outstanding refresh.
- Boot fails fast if `JWT_SECRET` is missing (already covered by `loadEnvOrExit`).
- `authMiddleware` no longer imports `jsonwebtoken` directly (`grep "from \"jsonwebtoken\"" src/features/shared/auth/infrastructure/http/authMiddleware.ts` returns nothing).

## References

- [Plan](./jwt_overhaul_plan.md) — Phases A/B/C from the original overhaul plus the new "Phase D — Refresh tokens + verify-port" appended for the audit.
- [Checklist](./jwt_overhaul_checklist.md) — Mirrors the plan; Phase D has the audit-driven items.
- [Decisions](./decisions.md) — Kit-local ADRs (refresh-token storage, rotation strategy).
- **Closes audit gaps:** [P0-1.1] (refresh tokens), [P1-10.3] (auth middleware leaks `jwt.verify`) in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`.
- **Owning ADRs:** ADR-005 (phase order) in `docs/internal/audits/saas-readiness/decisions.md`; (kit-local) ADR-001 in `./decisions.md`.
- **Effort:** L (refresh-token entity + migration + rotation logic + revocation + verify-port refactor).
- **Status:** Phase D shipped in #41 (`5001578`); its ADR-001 is now ADR-0019, Accepted. Phases A–C not started.
- **Predecessor / dependency:** None for the verify-port refactor; refresh-token rotation depends on a Redis or DB store decision (kit-local ADR-001).
