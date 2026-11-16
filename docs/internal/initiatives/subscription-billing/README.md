# Subscription & Billing Kit

Add the billing skeleton that most SaaS forks need within the first month: `Plan` + `Subscription` tables, a `BillingProvider` port with a Stripe adapter, webhook signature verification, and plan-gated middleware.

**Status: Deferred by owner decision of 2026-11-14 (#297), not started.** Billing stays designed, not built. Reopen only when all three hold: Lakira will charge real users; production is live (#237, and lakira-frontend #194); and a paid feature exists for a plan to gate. Before any code, settle four things the scope below does not: how the webhook gets its raw body ahead of `express.json()`, the webhook's exemption from the global rate limiter, how a route that exists only when a provider key is set appears in the OpenAPI spec, and which payment provider serves the market. This kit was scaffolded up front for planning visibility. Its earlier blocker, the multi-tenancy foundation (Phase 4), shipped in #44–#47; no billing code exists yet. Billing attaches to an organization, not a user.

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
