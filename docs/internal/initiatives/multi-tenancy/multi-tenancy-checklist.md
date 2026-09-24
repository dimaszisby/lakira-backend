# Multi-Tenancy Foundation — Checklist

## Phase 0 — Gating

- [x] ADR-004 in `docs/internal/audits/saas-readiness/decisions.md` flipped Proposed → Accepted.
- [x] Kit-local ADRs reviewed (`./decisions.md`).

## Phase 1 — Schema

- [x] Migration: create `organizations` (paranoid, slug UNIQUE). — `20260510000001-create-organizations.cjs`
- [x] Migration: create `memberships` (UNIQUE `(user_id, organization_id)`). — `20260510000002-create-memberships.cjs`
- [x] Migration: create `organization_invites` (token-by-email shape). — `20260510000003-create-organization-invites.cjs`
- [x] Migrations have working `down`.
- [ ] Run on dev + test; verify schema.

## Phase 2 — Backfill (existing data)

- [x] Backfill migration creates one Organization per user + owner Membership. — `20260510000004-backfill-organizations.cjs`
- [x] Idempotent (`WHERE NOT EXISTS`).
- [ ] Row counts captured in `metrics-tracker.md` (before/after).
- [ ] Run on staging; verify row counts.

## Phase 3 — Add `organization_id` to domain tables

- [x] Migration adds nullable `organization_id` to `metrics`, `metric_categories`, `metric_settings`, `metric_logs`, `processed_messages`. — `20260510000005-add-organization-id-to-domain-tables.cjs`
- [x] Add `organization_id` to `refresh_tokens` (nullable). — `20260512000001-add-organization-id-to-refresh-tokens.cjs`
- [ ] (If needed) Add `organization_id` to `password_reset_tokens`, `email_verification_tokens`.
- [x] Backfill: `UPDATE ... SET organization_id = (SELECT m.organization_id FROM memberships m WHERE m.user_id = X AND m.role = 'owner' LIMIT 1)`.
- [ ] Verify zero NULLs remain (`SELECT COUNT(*) WHERE organization_id IS NULL` per table).
- [x] Follow-up migration: NOT NULL + FK constraint. — `20260510000006-set-organization-id-not-null.cjs`

## Phase 4 — Auth + request scoping

- [x] JWT access-token claims include `organizationId`.
- [x] Login picks default membership (oldest `joined_at`, status `active`).
- [x] `authMiddleware` validates the membership is still active; sets `req.organizationId`, `req.membership.role`.
- [x] `assertHasOrgRole(req, role)` helper added.
- [x] `POST /auth/switch-org` route + `SwitchOrganization` use case; reissues access token via the refresh flow.
- [x] `SwitchOrganization` revokes all active refresh families before issuing new tokens.
- [x] `RotateRefreshToken` preserves org context from refresh token (falls back to default for legacy tokens).
- [x] Registration creates default Organization + owner Membership with explicit `status: "active"`.
- [x] Dedicated `switchOrgRateLimiter` (10 req / 15 min) on `POST /auth/switch-org`.
- [x] `TokenClaims.organizationId` typed as `string | null`; `JwtTokenProvider` returns `null` for legacy tokens.
- [x] `findByUserAndOrg` filters by `status: 'active'` at DB level.
- [x] Unit tests for `SwitchOrganization`, `assertHasOrgRole`/`requireOrgRole`, and negative paths (LoginUser, RotateRefreshToken, controller switchOrg).
- [x] All `requireAdmin` usages migrated to `assertHasOrgRole(req, "admin")`.

## Phase 5 — Repositories filter by org

- [x] Every repository method signature updated to require an `organizationId` (explicit parameter approach).
- [x] Sequelize finders include `where: { organizationId }` everywhere.
- [x] All use cases and queries pass `organizationId` through to repo/port calls.
- [x] All controllers read `req.user.organizationId` and pass it to use case `execute()`.
- [x] `db-helper.ts` utility functions updated with `organizationId` parameter.
- [x] Test fixtures updated to provide `organizationId`.
- [x] All cursor cache keys include `organizationId` segment; version constants bumped to evict stale cross-org entries on deploy.
- [x] `originalMetricExists` documented as intentionally cross-org (public metric cloning).
- [x] Cross-org isolation integration test added (`CrossOrgIsolation.integration.test.ts` — 4 cases).
- [x] Migration `20260512000002-add-status-to-memberships.cjs` created and applied; `memberships.status` column now present in test + dev DBs.
- [x] Unit tests pass (353/353).
- [x] Integration tests pass (154/157; 3 skipped — pre-existing).

## Phase 6 — Invites + role management

- [x] Use cases: `InviteUserToOrganization`, `AcceptInvite`, `RemoveMembership`, `ChangeMemberRole`.
- [x] Query: `ListOrganizationMembers`.
- [x] Routes: `POST /organizations/:id/invites`, `POST /invites/accept`, `DELETE /memberships/:id`, `PATCH /memberships/:id`, `GET /organizations/:id/members`.
- [x] Email template `organization-invite.ts`.
- [x] `OrganizationInviteRepository` port + Sequelize implementation.
- [x] `MembershipRepository.countByOrgAndRole` added.
- [x] Zod schemas + OpenAPI registration for all new endpoints.
- [x] DI wiring in `feature.ts` + routers mounted in `server.ts`.
- [x] `FRONTEND_INVITE_URL` and `INVITE_TOKEN_TTL_DAYS` env vars added.
- [x] Unit tests: 28 tests across 4 use case files (happy paths + edge cases).
- [x] Integration tests: 9 tests covering full invite→accept flow, member listing, role change, member removal, cross-org isolation.
- [x] OpenAPI regen.

## Phase 7 — Cleanup

- [x] Migration `20260516000001-drop-users-role-column.cjs` drops `users.role`.
- [x] Removed `role` from `AuthUser`, `UserDomain`, `UserAttributesBase`, `UserResponseDTO`, `UserMapper`, `UserRepositorySequelize`, `openapi-schemas.ts`, `zod-rules.ts`.
- [x] Removed auth-middleware fallback for tokens lacking `organizationId` — now returns 401.
- [x] Deleted legacy `src/shared/middleware/role.ts`.

## Wrap-up

- [x] `npm run typecheck && npm run lint && npm run format:write && npm test` — all 163 tests pass, 0 failures.
- [ ] Audit re-run shows P0-3.1, P0-9.1, P1-1.3 marked Pass.
- [ ] Update `iteration-plan.md` Phase 4 status to Pass Done with PR link(s).
