# ADR-0012 — Multi-tenancy direction for the SaaS base

- **Status:** Accepted (2026-09-24 — implementation verified in code; see the status note)
- **Date:** 2026-05-01
- **Related:** Realised by [ADR-0029](./adr-0029-fk-cascade-behaviour-on-organization-id.md)–[ADR-0031](./adr-0031-invite-token-format-mirrors-password-reset.md).
- **Origin:** `ADR-004` in the SaaS readiness audit kit — [`saas-readiness`](../../internal/audits/saas-readiness/decisions.md)

> **Status note (2026-09-24).** Moved from Proposed by the `docs-sweep` kit
> ([D-03](../../internal/initiatives/docs-sweep/decisions.md)): the decision below is in the code.
> Evidence: `organizations` and `memberships` tables and `organization_id` on every domain table
> (migrations `20260510000001`–`20260510000006`); `authMiddleware` requires the token's
> organization claim and an active membership and sets `req.organizationId`.

---

## Context

Audit gap [P0-3.1] / [P0-9.1]: zero matches for `tenant`, `workspace`, `organization_id` across `src/`. Every domain row uses `user_id` as the boundary. SaaS bases generally need a higher unit of isolation so a single user can be in multiple billing units. Retrofitting after launch requires backfilling every domain table.

## Decision

Introduce `Organization` + `Membership(userId, organizationId, role)` and add `organizationId` to all current and future domain tables. `req.organizationId` is derived in `authMiddleware` from the active membership. Forks that genuinely need single-tenant-per-user can ship with `Organization` rows that 1:1 mirror users — but the column exists.

## Options considered

- _(a) Personal-only, single-tenant-per-user, document explicitly._ Rejected for a fork-base because most forks need at least workspaces.
- _(b) Organization + Membership now (this decision)._ Selected.
- _(c) Schema-per-tenant or DB-per-tenant._ Rejected: overkill for a base; isolated by row is sufficient and simpler.

## Consequences

- Migration: add `organization_id UUID NOT NULL` to `metrics`, `metric_categories`, `metric_settings`, `metric_logs`, plus a backfill from `users`.
- Auth flow grows: invite, accept, switch-org.
- Authorization gains a per-membership role enum (`owner | admin | member`), replacing the current `users.role` enum.

## Links

- `audit-2026-05-01.md` § [P0-3.1], [P0-9.1], [P1-1.3]
- `src/features/shared/auth/infrastructure/persistence/models/user.sequelize.ts:65-69`

---
