# Ticket: Introduce subscription & billing skeleton

## Summary

Add `Plan` + `Subscription` tables with a `BillingProvider` port (Stripe adapter), webhook handling, plan-gated middleware (`requirePlan`), and customer portal integration. Ships as a single feature slice under `src/features/shared/billing/` (or `src/features/admin/billing/` for management routes).

## Background

The 2026-05-01 SaaS-readiness audit found no billing model ([P1-9.2]). Most SaaS forks add billing within the first month. Providing the skeleton with a port-based architecture lets forkers swap Stripe for Lemon Squeezy, Paddle, or a custom solution without rewriting use cases.

This is the last phase in the SaaS-readiness iteration plan and depends on multi-tenancy (Phase 4) being complete, since subscriptions attach to organizations.

## Acceptance Criteria

- `plans` and `subscriptions` tables exist with proper FK relationships.
- `free` and `pro` plans seeded.
- Stripe checkout session creates successfully (test mode).
- Stripe webhook updates subscription status idempotently.
- `requirePlan("pro")` middleware returns 403 for free-tier organizations.
- Customer portal session creates successfully.
- Cancellation flow works end-to-end.
- `npm run typecheck && npm run lint && npm test` green.
- OpenAPI spec includes `/billing/*` and `/webhooks/stripe` routes.

## Out of Scope

- Invoice/receipt generation — use Stripe's hosted invoices.
- Usage-based billing / metering.
- Multiple payment methods per organization.
- Tax calculation.
- Subscription tiers beyond `free`/`pro` in v1.

## Dependencies / Stakeholders

- **Blocked by:** Phase 4 (multi-tenancy) — `Subscription.organizationId` FK.
- **Soft-pre:** Phase 6 (forkability) — `BillingProvider` port benefits from the CachePort consolidation pattern.
- **Blocks:** nothing — this is the terminal phase.
- **DRI:** @dimaszisby.

## Reference docs

- `subscription-billing-plan.md` — phases A–D.
- `subscription-billing-checklist.md` — task tracker.
- `decisions.md` — kit-local ADRs.
- `docs/internal/initiatives/multi-tenancy/` — prerequisite kit.
