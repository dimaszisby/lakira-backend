# ADR-0016 — `requireAdmin` lives under `shared/auth/infrastructure/http/`

- **Status:** Superseded by [ADR-0030](./adr-0030-membership-role-replaces-users-role.md)
- **Date:** 2026-05-01
- **Origin:** `ADR-005` in the Feature audience restructure kit — [`feature-audience-restructure`](../../internal/initiatives/feature-audience-restructure/decisions.md)
- **Note:** originally logged as _Proposed_.
- **Note:** date backfilled from git history; the kit left it as `YYYY-MM-DD`.

> **Status note (2026-09-24).** `requireAdmin` no longer exists. ADR-0030 replaced it with
> `requireOrgRole` / `assertHasOrgRole`
> (`src/features/shared/auth/infrastructure/http/assertHasOrgRole.ts`), which read
> `req.membership.role`. The location decision below applies to that file instead.

---

## Context

A new middleware is needed to guard `/api/v1/admin/*`. It needs `req.user` (set by `authMiddleware`) and a role check. Where it lives shapes future expansion.

## Decision

Place it at `src/features/shared/auth/infrastructure/http/requireAdmin.ts` and re-export from `shared/auth/index.ts`. Today's logic is a 6-line role check.

## Options considered

1. **Top-level `src/shared/middleware/`** — that dir is locked. Rejected.
2. **`shared/auth/infrastructure/http/` (chosen)** — auth concerns belong with auth; `requireAdmin` directly extends what `authMiddleware` produced.
3. **Future `features/shared/authorization/` slice** — over-engineering for one middleware. Promote later if authorization grows complex (multi-role, scopes, tenant-aware).

## Consequences

- The auth slice owns both authentication and basic authorization, which is conventional.
- If future authorization grows (RBAC, scopes), extract to a dedicated `authorization` shared slice and supersede this ADR.

## Links

[Plan §Phase 7](../../internal/initiatives/feature-audience-restructure/feature-audience-restructure-plan.md#phase-7--wire-apiv1admin-namespace)
