# Subscription & Billing Kit

Add the billing skeleton that most SaaS forks need within the first month: `Plan` + `Subscription` tables, a `BillingProvider` port with a Stripe adapter, webhook signature verification, and plan-gated middleware.

**Status: Deferred — unblocked, not started.** This kit is scaffolded up front for planning visibility. Its blocker, the multi-tenancy foundation (Phase 4), shipped in #44–#47; no billing code exists yet. Billing attaches to an organization, not a user.

## Scope

- `Plan` table seeded with `free` and `pro`.
- `Subscription` table (`organizationId`, `planId`, `status`, `currentPeriodEnd`, `stripeSubscriptionId`).
- `BillingProvider` port with Stripe adapter.
- `/webhooks/stripe` route with signature verification.
- `requirePlan("pro")` middleware.
- Customer portal redirect endpoint.

## Out of Scope

- Invoice/receipt generation — use Stripe's hosted invoices.
- Usage-based billing / metering.
- Multiple payment methods.
- Tax calculation (Stripe Tax or external).
- Subscription tiers beyond `free`/`pro` (add later as seeds).

## References

- **Closes audit gaps:** [P1-9.2] in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`
- **Owning ADRs:** ADR-005 (phase order) in `docs/internal/audits/saas-readiness/decisions.md`; (kit-local) ADR-001, ADR-002 in `./decisions.md`
- **Effort:** L
- **Status:** Proposed — deferred kickoff
- **Predecessor / dependency:** Depended on Phase 4 (multi-tenancy), which has shipped (#44–#47) — billing entity attaches to `Organization`, not `User`
