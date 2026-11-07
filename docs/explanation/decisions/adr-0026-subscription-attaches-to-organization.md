# ADR-0026 — Subscription attaches to Organization, not User

- **Status:** Proposed
- **Date:** 2026-05-03
- **Origin:** `ADR-002` in the Subscription & billing kit — [`subscription-billing`](../../internal/initiatives/subscription-billing/decisions.md)

---

## Context

With multi-tenancy (Phase 4), the billing entity could attach to either `User` or `Organization`. In a team-based SaaS, billing is per-organization (one subscription covers all members). In a consumer SaaS, billing is per-user.

## Decision

1. `Subscription.organizationId FK organizations(id)` — billing is per-organization.
2. One active subscription per organization (enforced by a unique partial index on `(organization_id) WHERE status IN ('active','trialing')`).
3. The `free` plan is the implicit default for organizations without an explicit subscription row.
4. `requirePlan("pro")` middleware reads the subscription for `req.organizationId`.

## Options considered

- _Per-user billing._ Rejected: the multi-tenancy model uses organizations as the unit of isolation; billing should match.
- _Support both._ Rejected: premature flexibility. Forks targeting consumer use cases can change the FK.

## Consequences

- Hard dependency on Phase 4 (multi-tenancy). Cannot start schema work until `organizations` table exists.
- Org owners/admins manage billing; members see the plan but can't change it.

## Links

- `docs/internal/initiatives/multi-tenancy/multi-tenancy-plan.md`
- `subscription-billing-plan.md` § Phase A
