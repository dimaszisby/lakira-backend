# Subscription & Billing — Checklist

- Timestamp: 2026-05-03T00:00:00Z
- Plan: `./subscription-billing-plan.md`
- Closes: [P1] 9.2
- Blocked by: Phase 4 (multi-tenancy)

## Phase A — Schema

- [ ] Migration: create `plans` table (UUID PK, name, stripe_price_id, features JSONB, is_active).
- [ ] Migration: create `subscriptions` table (organization_id FK, plan_id FK, status, stripe IDs, period dates).
- [ ] Seed migration: insert `free` and `pro` plan rows.
- [ ] Migrations have working `down`.
- [ ] Run on dev + test; verify schema.

## Phase B — Domain & Application

- [ ] `Plan` value object with `id`, `name`, `features`, `isActive`.
- [ ] `Subscription` entity with `isActive()`, `isPastDue()`, `canAccessFeature()`.
- [ ] `BillingProvider` port (checkout, portal, cancel, webhook verification).
- [ ] `SubscriptionRepository` port.
- [ ] `PlanRepository` port.
- [ ] `CreateCheckoutSession` use case.
- [ ] `HandleWebhookEvent` use case (idempotent).
- [ ] `GetOrganizationSubscription` use case.
- [ ] `CancelSubscription` use case.
- [ ] `CreatePortalSession` use case.

## Phase C — Infrastructure

- [ ] `StripeBillingProvider` adapter implementing `BillingProvider`.
- [ ] Webhook signature verification via `stripe.webhooks.constructEvent`.
- [ ] Sequelize models for `Plan` and `Subscription`.
- [ ] `POST /billing/checkout` route.
- [ ] `POST /billing/portal` route.
- [ ] `POST /billing/cancel` route.
- [ ] `GET /billing/subscription` route.
- [ ] `POST /webhooks/stripe` route (unauthenticated, signature-verified).
- [ ] `requirePlan(planName)` middleware with Redis cache + DB fallback.
- [ ] `buildSubscriptionFeature()` factory with dependency overrides.

## Phase D — Integration & Testing

- [ ] Unit tests: `Subscription` entity methods.
- [ ] Unit tests: `HandleWebhookEvent` use case with mock provider.
- [ ] Unit tests: `requirePlan` middleware with mock subscription.
- [ ] Integration tests: `SubscriptionRepository` CRUD.
- [ ] Integration tests: webhook route with mocked Stripe signature.
- [ ] Integration tests: checkout/portal/cancel routes.
- [ ] Seed script `npm run seed:plans` (idempotent).
- [ ] OpenAPI regen: `npm run docs:openapi:generate`.
- [ ] Add Stripe env vars to `.env.example`.

## Wrap-up

- [ ] `npm run typecheck && npm run lint && npm run format:write && npm test` green.
- [ ] Audit re-run grades 9.2 as Pass.
