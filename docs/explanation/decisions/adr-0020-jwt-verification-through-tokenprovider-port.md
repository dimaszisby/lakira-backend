# ADR-0020 — Move JWT verification through the `TokenProvider` port

- **Status:** Accepted (2026-09-24 — implementation verified in code; see the status note)
- **Date:** 2026-05-02
- **Origin:** `ADR-002` in the JWT kit — [`jwt`](../../internal/initiatives/jwt/decisions.md)

> **Status note (2026-09-24).** Moved from Proposed by the `docs-sweep` kit
> ([D-03](../../internal/initiatives/docs-sweep/decisions.md)): the decision below is in the code.
> Evidence: `TokenProvider.verify()` implemented by `JwtTokenProvider`; `authMiddleware` is built by
> `makeAuthMiddleware(...)` and calls `tokenProvider.verify(token)`.
> **Differs from point 2:** `InvalidTokenError` now extends `DomainError`, not `AppError`
> ([ADR-0044](./adr-0044-feature-boundaries-and-their-frozen-exceptions.md) moved HTTP status
> codes out of the domain); the error middleware still maps it to 401.

---

## Context

Audit gap [P1-10.3]: `src/features/shared/auth/infrastructure/http/authMiddleware.ts:42` calls `jwt.verify(token, env.JWT_SECRET)` directly with a top-level `import jwt from "jsonwebtoken"`. The `TokenProvider` port exposes only `sign()`, so verification bypasses the hexagonal boundary.

## Decision

1. Extend the `TokenProvider` port:
   ```ts
   verify(token: string): Promise<TokenClaims>;
   ```
   where `TokenClaims = { userId: string; email: string; iat: number; exp: number; kid?: string }`.
2. Implement in `JwtTokenProvider.verify()` using `jsonwebtoken.verify`. Throw a domain-level `InvalidTokenError extends AppError` (status 401) on any failure.
3. Inject `TokenProvider` into `authMiddleware` via a factory (`makeAuthMiddleware(tokenProvider, userRepository)`). Replace the inline `jwt.verify` call with `await tokenProvider.verify(token)`.
4. Wire `tokenProvider` from `buildAuthFeature()` in `src/features/shared/auth/feature.ts`. Remove the `import jwt from "jsonwebtoken"` from `authMiddleware.ts`.
5. Unit-test `JwtTokenProvider.verify` directly. Update existing `authMiddleware` tests to mock the port instead of `jsonwebtoken`.

## Options considered

- _Leave the leak; document it as accepted technical debt._ Rejected: the audit specifically called this out as a hexagonal-violation example; future forkers should see the canonical pattern.
- _Add a separate `TokenVerifier` port._ Rejected: signing and verifying belong together; splitting the port creates two adapters with the same JWT secret.

## Consequences

- `authMiddleware` becomes a factory rather than a top-level export. Update import sites in feature routers.
- The change is invisible to callers — same 401 behavior, same response body. No OpenAPI delta.
- Forkers can swap `JwtTokenProvider` for a Paseto/Branca adapter by changing one file.

## Links

- `audit-2026-05-01.md` § [P1-10.3] in `docs/internal/audits/saas-readiness/`
- `src/features/shared/auth/infrastructure/http/authMiddleware.ts:3,42`
- `src/features/shared/auth/application/ports/TokenProvider.ts`
