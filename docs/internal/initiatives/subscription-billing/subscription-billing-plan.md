# Subscription & Billing — Plan

- Timestamp: 2026-05-03T00:00:00Z
- Closes audit gaps: [P1] 9.2 in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`
- Blocked by: Phase 4 (multi-tenancy) — `Organization` must exist before `Subscription` can FK to it.

## Context & Goals

The SaaS-readiness audit found no billing model, no payment integration, and no plan-gating middleware. Most forks add billing within weeks, so providing the skeleton — behind a `BillingProvider` port — lets forkers swap Stripe for Lemon Squeezy, Paddle, or a custom solution without rewriting the application layer.

## Phase A — Schema

**Goal:** Database foundation for plans and subscriptions.

1. **Migration: create `plans` table:**
   - `id UUID PK DEFAULT gen_random_uuid()`.
   - `name VARCHAR(50) NOT NULL UNIQUE` (e.g., `"free"`, `"pro"`).
   - `stripe_price_id VARCHAR(255) NULL` (nullable — only set when Stripe is the provider).
   - `features JSONB NOT NULL DEFAULT '{}'` — freeform feature flags per plan.
   - `is_active BOOLEAN NOT NULL DEFAULT true`.
   - `created_at`, `updated_at` (Sequelize timestamps).
2. **Migration: create `subscriptions` table:**
   - `id UUID PK`.
   - `organization_id UUID NOT NULL FK organizations(id) ON DELETE RESTRICT`.
   - `plan_id UUID NOT NULL FK plans(id) ON DELETE RESTRICT`.
   - `status VARCHAR(20) NOT NULL CHECK status IN ('active','past_due','canceled','trialing')`.
   - `stripe_subscription_id VARCHAR(255) NULL UNIQUE`.
   - `stripe_customer_id VARCHAR(255) NULL`.
   - `current_period_start TIMESTAMPTZ NULL`.
   - `current_period_end TIMESTAMPTZ NULL`.
   - `canceled_at TIMESTAMPTZ NULL`.
   - `created_at`, `updated_at`.
   - Index on `organization_id`.
3. **Seed migration:** Insert `free` and `pro` plan rows.
4. **Migrations have working `down`.**

## Phase B — Domain & Application

**Goal:** DDD entities, ports, and use cases.

1. **Domain entities:**
   - `Plan` — value object with `id`, `name`, `features`, `isActive`.
   - `Subscription` — entity with `id`, `organizationId`, `planId`, `status`, `currentPeriodEnd`, etc. Methods: `isActive()`, `isPastDue()`, `canAccessFeature(feature: string)`.
2. **Ports:**
   - `BillingProvider` — `createCustomer(org)`, `createCheckoutSession(org, planId)`, `createPortalSession(org)`, `cancelSubscription(subscriptionId)`, `constructWebhookEvent(body, signature)`.
   - `SubscriptionRepository` — `findByOrganizationId(orgId)`, `save(subscription)`, `update(subscription)`.
   - `PlanRepository` — `findById(id)`, `findByName(name)`, `findAll()`.
3. **Use cases:**
   - `CreateCheckoutSession` — org owner initiates upgrade; delegates to `BillingProvider`.
   - `HandleWebhookEvent` — processes Stripe webhook events (subscription created/updated/deleted, payment failed).
   - `GetOrganizationSubscription` — returns current subscription status.
   - `CancelSubscription` — org owner cancels; calls `BillingProvider.cancelSubscription`.
   - `CreatePortalSession` — org owner accesses Stripe customer portal.

## Phase C — Infrastructure

**Goal:** Stripe adapter, Sequelize models, HTTP routes.

1. **Stripe adapter** (`StripeBillingProvider`):
   - Implements `BillingProvider` port.
   - Uses `stripe` npm package.
   - Webhook signature verification via `stripe.webhooks.constructEvent`.
   - Gated by `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` env vars.
2. **Sequelize models** for `Plan` and `Subscription`.
3. **HTTP routes:**
   - `POST /billing/checkout` — create checkout session (authenticated, org owner/admin).
   - `POST /billing/portal` — create customer portal session (authenticated, org owner/admin).
   - `POST /billing/cancel` — cancel subscription (authenticated, org owner).
   - `GET /billing/subscription` — get current subscription (authenticated).
   - `POST /webhooks/stripe` — webhook handler (unauthenticated, signature-verified).
4. **Middleware:**
   - `requirePlan(planName: string)` — checks `req.organizationId`'s subscription plan; returns 403 if insufficient.
   - Reads from cache (Redis) with DB fallback.

## Phase D — Integration & Testing

**Goal:** End-to-end verification.

1. **Unit tests:**
   - `Subscription` entity methods.
   - `HandleWebhookEvent` use case with mock `BillingProvider`.
   - `requirePlan` middleware with mock subscription.
2. **Integration tests:**
   - `SubscriptionRepository` CRUD.
   - Webhook route with mocked Stripe signature.
   - Checkout/portal routes (mock Stripe client).
3. **Seed script:** `npm run seed:plans` — inserts `free`/`pro` plans (idempotent).
4. **OpenAPI regen:** `npm run docs:openapi:generate`.
5. **Env documentation:** Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` to `.env.example`.

## Dependencies & Risks

- **Hard dependency on multi-tenancy (Phase 4):** `Subscription.organizationId` FK to `organizations`. Do not start until Phase 4 is complete.
- **Stripe account required for integration testing:** Use Stripe test mode. CI can use a dedicated test-mode API key.
- **Webhook reliability:** Stripe retries failed webhooks for up to 3 days. The `HandleWebhookEvent` use case must be idempotent (check subscription status before updating).
- **Plan changes:** Adding new plans is a seed migration + Stripe dashboard configuration. No code change needed.

## References

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md` § 9.2
- `docs/internal/audits/saas-readiness/iteration-plan.md` — Phase 8
- `docs/internal/initiatives/multi-tenancy/` — prerequisite kit
