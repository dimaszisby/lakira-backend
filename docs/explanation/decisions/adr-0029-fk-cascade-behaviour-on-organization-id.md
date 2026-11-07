# ADR-0029 — FK cascade behavior on `organization_id`

- **Status:** Accepted
- **Date:** 2026-05-11
- **Origin:** `ADR-001` in the Multi-tenancy kit — [`multi-tenancy`](../../internal/initiatives/multi-tenancy/decisions.md)

---

## Context

Every domain table gains an `organization_id UUID NOT NULL FK organizations(id)`. When an organization is deleted (paranoid soft-delete) or hard-deleted, what happens to its rows?

## Decision

1. **`ON DELETE RESTRICT`** for all domain tables (`metrics`, `metric_categories`, `metric_settings`, `metric_logs`). A hard-delete on `organizations` only succeeds if no domain rows reference it.
2. Soft-deleting an organization (paranoid `deletedAt`) does NOT cascade — the domain rows remain queryable but every read path that scopes by `organizationId` will see zero results because the membership lookup will exclude soft-deleted orgs.
3. **`ON DELETE CASCADE`** for `memberships` and `organization_invites` — these are bookkeeping artifacts that have no value without their organization.
4. **`processed_messages`** is system bookkeeping (RabbitMQ idempotency); it gets `ON DELETE SET NULL` so a deleted org doesn't break message replay.

## Options considered

- _Cascade everywhere._ Rejected: a single typo could nuke the metric history of a paying customer. Restrict forces explicit intent.
- _SET NULL on domain tables._ Rejected: every domain row is meaningless without its org context.

## Consequences

- Hard-deleting an org becomes a deliberate multi-step flow (drain memberships, soft-delete first, run a purge job).
- Test fixtures cleaning up via `truncate ... cascade` still work because integration tests truncate every table.

## Links

- `multi-tenancy-plan.md` § Phase 1, Phase 3.

---
