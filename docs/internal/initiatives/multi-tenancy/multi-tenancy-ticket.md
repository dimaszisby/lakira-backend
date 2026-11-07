# Ticket: Introduce multi-tenancy foundation

## Summary

Add `Organization` + `Membership` + `organization_id` on every domain table, replacing the `users.role` enum with a per-membership role. This is the largest single SaaS-readiness phase and ships across 6 incremental PRs.

## Background

The 2026-05-01 SaaS-readiness audit (`docs/internal/audits/saas-readiness/audit-2026-05-01.md`) found zero matches for `tenant`, `workspace`, or `organization_id` in `src/`. Every domain row uses `user_id` as the boundary. SaaS bases generally need a higher unit of isolation so a user can be in multiple billing units; retrofitting after launch requires backfilling every domain table.

ADR-004 in the saas-readiness decisions log proposes Option (b) "Organization + Membership now" over (a) "personal-only" and (c) "schema-per-tenant". This ticket implements that decision.

## Acceptance Criteria

- A user belonging to two organizations sees disjoint row sets when `req.organizationId` switches.
- Existing single-user integration tests pass without changes (each user becomes the owner of an auto-created 1:1 organization).
- `users.role` column is dropped after the migration; `Membership.role` is the source of truth.
- `requireAdmin` callers migrated to `assertHasOrgRole(req, "admin")`.
- JWT access tokens carry an `organizationId` claim. Login picks the default membership; `/auth/switch-org` reissues a token for a different membership.
- Invite flow (`POST /organizations/:id/invites`, `POST /invites/accept`) works end-to-end with email delivery via the existing `EmailSender` port.
- `npm run typecheck && npm run lint && npm test` green on the feature branch.
- OpenAPI spec regenerated to include the new `/organizations`, `/invites`, `/memberships`, `/auth/switch-org` routes.

## Out of Scope

- Cross-org sharing of rows (a row belongs to exactly one org).
- Per-org subdomains or vanity URLs.
- Subscription/plan tied to organization (Phase 8 — subscription-billing kit).
- Org-level audit log (later).
- Org-level branding / theming.

## Dependencies / Stakeholders

- **Blocked by:** ADR-004 acceptance (in `saas-readiness/decisions.md`).
- **Soft-pre:** Phase 1 (refresh tokens) ideally lands first so the `organizationId` claim can ride on the new access-token shape.
- **Blocks:** Phase 5 (drift cleanup — would collide with `organization_id` migrations) and Phase 8 (subscription-billing — billing entity attaches to an org, not a user).
- **DRI:** @dimaszisby.
- **Reviewers:** none required (single-developer repo). External reviewers welcome on the largest PRs (Phase 4 auth changes, Phase 5 repository signature churn).

## Reference docs

- `multi-tenancy-plan.md` — phases 0–7, risks, rollback.
- `multi-tenancy-checklist.md` — task tracker.
- `decisions.md` — kit-local ADRs (FK cascade, role enum location, invite-token format).
- `metrics-tracker.md` — backfill row-count tracker.
- `incidents.md` — populated as the migration runs.
