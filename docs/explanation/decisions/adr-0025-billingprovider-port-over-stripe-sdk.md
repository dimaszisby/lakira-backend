# ADR-0025 — BillingProvider port abstraction over direct Stripe SDK

- **Status:** Proposed
- **Date:** 2026-05-03
- **Origin:** `ADR-001` in the Subscription & billing kit — [`subscription-billing`](../../internal/initiatives/subscription-billing/decisions.md)

---

## Context

The audit recommends a billing skeleton. Stripe is the most common choice, but forkers may prefer Lemon Squeezy, Paddle, or a custom gateway. The DDD architecture in this repo already uses ports for email (`EmailSender`), cache (`CachePort`), queue (`QueuePort`), and auth (`TokenProvider`).

## Decision

1. Define a `BillingProvider` port in `application/ports/BillingProvider.ts` with methods: `createCustomer`, `createCheckoutSession`, `createPortalSession`, `cancelSubscription`, `constructWebhookEvent`.
2. Implement `StripeBillingProvider` in `infrastructure/billing/StripeBillingProvider.ts`.
3. The port does NOT abstract away Stripe-specific webhook event types — the `HandleWebhookEvent` use case receives a provider-neutral event shape translated by the adapter.
4. Gated by `STRIPE_SECRET_KEY` env var — if not set, the billing feature does not register routes (graceful opt-out for forks that don't need billing yet).

## Options considered

- _Direct Stripe SDK usage in use cases._ Rejected: violates the hexagonal architecture established by every other infrastructure concern in the repo.
- _Generic `PaymentProvider` name._ Rejected: `BillingProvider` is more accurate — it covers subscriptions, not one-off payments.

## Consequences

- Forkers swapping to Lemon Squeezy implement a new adapter; use cases don't change.
- Webhook signature verification is provider-specific — each adapter implements `constructWebhookEvent` differently.

## Links

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md` § 9.2
- `subscription-billing-plan.md` § Phase B, Phase C

---
