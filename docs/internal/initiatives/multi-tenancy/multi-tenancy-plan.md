# Multi-Tenancy Foundation — Plan

## Context & Goals

The 2026-05-01 audit found zero matches for `tenant`, `workspace`, `account_id`, `organization_id` across `src/`. Every domain row uses `user_id` as the boundary. SaaS bases need a higher unit of isolation so a single user can belong to multiple billing units; retrofitting after launch requires backfilling every domain table.

Goal: introduce `Organization` + `Membership` and add `organization_id` to every domain table, in a way that:

- Doesn't break the existing single-user-per-row tests (each user gets an auto-created 1:1 organization on the backfill).
- Lets forks that genuinely want single-tenant-per-user ship without changing anything (the column is there but functionally identical to `user_id`).
- Replaces the `users.role` stub enum with a real per-membership role.

## Type definitions

- **Organization:** the unit of isolation. Has a name, an owner, billing context (added later in Phase 8). Owns rows.
- **Membership:** a join table `(userId, organizationId, role, status, joinedAt)`. A user can belong to multiple organizations. `role ∈ {owner, admin, member}`. `status ∈ {active, invited, removed}`.
- **Active organization:** the organization a request operates on, derived from the JWT `organizationId` claim or from a default-membership lookup if the claim is absent.
- **Invite:** a `(organizationId, email, role, tokenHash, expiresAt, acceptedAt)` row. Mirrors password-reset for shape.

## Phases

### Phase 0 — ADR acceptance + repo scaffolding

1. ADR-004 in `docs/internal/audits/saas-readiness/decisions.md` flips Proposed → Accepted by the user. This kit's `decisions.md` ADRs (FK cascade, role enum location, invite-token format) are reviewed.
2. No code changes in this phase.

### Phase 1 — Schema (forward-only path)

1. Migration `YYYYMMDDHHMMSS-create-organizations.cjs`: `id UUID PK`, `name VARCHAR(120) NOT NULL`, `slug VARCHAR(80) NOT NULL UNIQUE`, `created_by_user_id FK users`, `created_at`, `updated_at`, `deleted_at` (paranoid).
2. Migration `YYYYMMDDHHMMSS-create-memberships.cjs`: `id UUID PK`, `user_id FK users NOT NULL`, `organization_id FK organizations NOT NULL`, `role VARCHAR(20) NOT NULL CHECK role IN ('owner','admin','member')`, `status VARCHAR(20) NOT NULL DEFAULT 'active'`, `joined_at`, `created_at`, `updated_at`. UNIQUE `(user_id, organization_id)`.
3. Migration `YYYYMMDDHHMMSS-create-organization-invites.cjs`: token-by-email shape (id, organization_id, email, role, token_hash UNIQUE, expires_at, accepted_at NULL, created_at).
4. Each migration has a working `down`.

### Phase 2 — Backfill

1. Migration `YYYYMMDDHHMMSS-backfill-organizations.cjs`: for every `users` row, insert an `Organization` with `name = "Personal Workspace"`, `slug = lower(replace(users.username, ' ', '-'))` (deduped if needed), `created_by_user_id = users.id`. Insert a `Membership(userId, organizationId, role: 'owner', status: 'active', joinedAt: now())`.
2. Idempotent via `INSERT ... WHERE NOT EXISTS`. Wrapped in a single transaction.
3. Track row counts in `metrics-tracker.md` before / after.

### Phase 3 — `organization_id` on domain tables

1. Migration adds `organization_id UUID NULL` to: `metrics`, `metric_categories`, `metric_settings`, `metric_logs`, `processed_messages`, `password_reset_tokens` (only if forks expect org-scoping for it; otherwise leave user-only).
2. Backfill: `UPDATE metrics SET organization_id = (SELECT m.organization_id FROM memberships m WHERE m.user_id = metrics.user_id AND m.role = 'owner' LIMIT 1)` etc. Track in metrics-tracker.
3. Once the backfill is complete and verified, a follow-up migration sets the columns NOT NULL and adds FK constraints.
4. Refresh tokens (Phase 1) and email verification tokens (Phase 3) gain `organization_id` if they have shipped by this point.

### Phase 4 — Auth + request scoping

1. Extend the JWT access-token claims with `organizationId`. The login flow picks a default membership (oldest `joined_at` among `status='active'`).
2. `authMiddleware` reads `organizationId` from the token, looks up the membership to confirm it is still active, sets `req.organizationId` and `req.membership.role`.
3. New helper `assertHasOrgRole(req, "admin" | "owner")` in `src/features/shared/auth/infrastructure/http/role-guards.ts`.
4. New route `POST /auth/switch-org` issues a fresh access token with the new `organizationId` claim (validated against the user's memberships). Refresh-token reuse handles the rotation.
5. Drop `users.role` (`role` already exists per current model). Replace all `requireAdmin` usages with `assertHasOrgRole(req, "admin")`. Migration to drop the column comes after all read sites are off it.

### Phase 5 — Repositories filter by org

1. Every repository method that takes `userId` adds `organizationId` either as a parameter or implicitly via a `RequestContext` argument (see ADR in this kit's `decisions.md`).
2. Sequelize finders: every domain query gains `where: { organizationId, ... }`.
3. Existing tests update mass-replaced via codemod: pass `req.organizationId` from the fixture.
4. `MetricRepoSequelize.create()` and similar writes now require `organizationId` at the call site; the controller derives it from `req.organizationId`.

### Phase 6 — Invites + UI hooks

1. Use cases: `InviteUserToOrganization`, `AcceptInvite`, `RemoveMembership`, `ChangeMemberRole`.
2. Routes: `POST /organizations/:id/invites`, `POST /invites/accept`, `DELETE /memberships/:id`, `PATCH /memberships/:id`.
3. Email template `organization-invite.ts` reusing the `EmailSender` port.
4. OpenAPI regen.

## Risks, trade-offs, rollback

- **Backfill on a large dataset.** The Phase 2 + 3 backfills wrap in a single transaction. For a 50M-row table this can fail or hold locks too long. Mitigation: batch in chunks of 10k rows in a non-transactional script for production; staging-only single-transaction works for Lakira's current size.
- **JWT claim drift.** Existing tokens issued before Phase 4 do not carry `organizationId`. `authMiddleware` falls back to the user's default membership when the claim is absent. Once all tokens have rotated (after refresh-token TTL), the fallback can be removed.
- **Repository signature churn.** Every repository method changes shape. Mitigation: do the codemod in one large PR with reviewable hunks; extensive use of integration tests as a regression net.
- **Roles overlap with `users.role`.** Plan keeps both during the transition. Audit the column's read sites in a separate sweep before dropping it.
- **Rollback:** the new tables can be dropped, and the `organization_id` columns can be marked nullable again. The hardest rollback is reverting the repository signature change — keep the old methods as deprecated thin wrappers for one release if needed.

## Success metrics

- A user belonging to two organizations sees disjoint row sets when switching.
- All existing integration tests pass (each user is auto-owner of their org).
- `users.role` column is removed; `Membership.role` is the source of truth.
- Audit re-run marks P0-3.1, P0-9.1, P1-1.3 as Pass.
