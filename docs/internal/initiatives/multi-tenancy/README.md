# Multi-Tenancy Foundation

## Overview

Introduces `Organization` + `Membership(userId, organizationId, role)` as the unit of isolation for SaaS use, and adds `organization_id` to every domain table. Forks that need only single-tenant-per-user can ship with auto-created 1:1 organizations; the column exists either way so the data model never has to be retrofitted.

This is the largest single phase in the SaaS-readiness remediation. It is gated by `ADR-004` in `docs/internal/audits/saas-readiness/decisions.md` flipping from **Proposed → Accepted**.

- **Owning squad / DRI:** @dimaszisby
- **Files most affected:** every Sequelize model, every feature router/controller (request scoping), `src/features/shared/auth/infrastructure/http/authMiddleware.ts`, every migration file.

## Scope

**In scope:**

- New `organizations` and `memberships` tables.
- New domain entities `Organization`, `Membership`.
- `organization_id` FK on `metrics`, `metric_categories`, `metric_settings`, `metric_logs`, `processed_messages`, `password_reset_tokens` (only where ownership semantics matter), `email_verification_tokens` (when Phase 3 ships first), `refresh_tokens` (when Phase 1 ships first).
- Pre-data backfill migration: for each existing `users` row, create an `Organization` with the user as `owner` and stamp every existing domain row with that org's id.
- `req.organizationId` derived in `authMiddleware` from the active membership.
- Replace `users.role` enum with `Membership.role` (`owner | admin | member`). Drop the column from `users` after all read sites migrate.
- Invite, accept-invite, switch-org HTTP routes and use cases.
- All existing read/write paths gain an `organizationId` filter. Repositories add a method signature that requires it (no more "find everything for this user").

**Out of scope:**

- Cross-org sharing.
- Per-org subdomains / vanity URLs.
- Subscription/plan tied to organization (handled in Phase 8 — subscription-billing kit).
- Org-level audit log (separate later kit).

## Commands & Tooling

- `npm run typecheck && npm run lint`
- `npm run test:unit -- multi-tenancy`
- `npm run test:integration -- (auth|metric|metric-log|metric-settings|metric-category|analytics)`
- `npm run docs:openapi:generate`
- DB safety: take a snapshot before running the backfill migration on staging.

## Verification

- A second user joining an existing organization can read shared `metrics` rows; without the membership, they cannot.
- Switching organizations changes which rows the same JWT can read.
- Existing single-user tests still pass without modification (because each user becomes the sole owner of their auto-created organization).
- Audit re-run marks P0-3.1, P0-9.1, P1-1.3 as Pass.

## References

- [Plan](./multi-tenancy-plan.md) — phases 0–6, risks, rollback.
- [Checklist](./multi-tenancy-checklist.md) — per-phase task tracking.
- [Ticket](./multi-tenancy-ticket.md) — RFC-style summary, acceptance criteria.
- [Decisions](./decisions.md) — kit-local ADRs (FK cascade, role enum location, invite-token format).
- [Incidents](./incidents.md) — populated as the migration runs.
- [Metrics tracker](./metrics-tracker.md) — backfill row counts + rollout progress.
- **Closes audit gaps:** [P0-3.1] (no multi-tenancy primitives in DB), [P0-9.1] (same gap as 3.1, listed under SaaS-specific category), [P1-1.3] (RBAC stub, replaced by membership.role) in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`.
- **Owning ADRs:** ADR-004 in `docs/internal/audits/saas-readiness/decisions.md` MUST be Accepted before kickoff.
- **Effort:** L (multi-week, multi-PR). Recommended split across 6 phases with separate PRs.
- **Status:** Done — shipped in #44–#47 (`bf74caa`, `f0deecc`, `e76f25c`, `f6b62e3`); ADR-004 is ADR-0012, Accepted.
- **Predecessor / dependency:** Phase 1 (refresh tokens) ideally lands first so `organizationId` claims can ride on the new access-token format. Phase 5 (drift cleanup) should run AFTER this phase to avoid migration collisions.
