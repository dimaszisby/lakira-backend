# ADR-0030 — Membership.role enum lives on `memberships`, replaces `users.role`

- **Status:** Accepted
- **Date:** 2026-05-11
- **Related:** Supersedes [ADR-0016](./adr-0016-require-admin-lives-under-shared-auth.md) (`requireAdmin`).
- **Origin:** `ADR-002` in the Multi-tenancy kit — [`multi-tenancy`](../../internal/initiatives/multi-tenancy/decisions.md)

---

## Context

The current `users.role` enum (`'user' | 'admin'`) is global per user. With organizations, the same user can be `owner` of one org and `member` of another. The role belongs on the join.

## Decision

1. Add `role VARCHAR(20) NOT NULL CHECK role IN ('owner','admin','member')` on `memberships`.
2. `requireAdmin` middleware is replaced by `assertHasOrgRole(req, "admin" | "owner")` which reads `req.membership.role`.
3. After all read sites migrate (Phase 5), drop `users.role` in a follow-up migration. Until then the column is dead-code-ignored but kept (zero-downtime).
4. There is no global "platform admin" concept in this base. Forks that need one can add a `users.platform_role` column without affecting org membership.

## Options considered

- _Keep `users.role` AND add `Membership.role` for two layers of authorization._ Rejected: doubles the surface; forks can add a global role later if needed.
- _Use a separate `permissions` table._ Rejected: premature; three roles is enough for the base. RBAC granularity is a future concern.

## Consequences

- One enum migration, one role-helper module, one `requireAdmin` deprecation.
- Future "platform admin" concept lands as an additive column on `users`.

## Links

- `audit-2026-05-01.md` § [P1-1.3]
- `src/features/shared/auth/infrastructure/persistence/models/user.sequelize.ts:65-69`
- `src/features/shared/auth/infrastructure/http/requireAdmin.ts`

---
