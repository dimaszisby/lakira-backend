# Password Reset Feature

- Last updated: 2026-04-24
- Owner: @dimaszisby

## Overview

Self-service password reset via email. User submits their email, receives a single-use link with a 15-minute token, and POSTs the token + a new password to confirm. First feature to use the new `EmailSender` port; Resend is the production provider, with a console adapter for dev/test.

## Scope

**In scope**

- New routes `POST /auth/forgot-password` and `POST /auth/reset-password` under the existing auth slice.
- New `password_reset_tokens` table (token-hash storage, single-use, 15 min TTL).
- `EmailSender` port with `ResendEmailSender` (prod/staging) and `ConsoleEmailSender` (dev/test) adapters.
- HTML + plain-text inline email template.
- Rate limiters: per-email and per-IP on `/forgot-password`; per-IP on `/reset-password`.

**Out of scope**

- JWT session revocation on password change (security tier "Maximum" — deferred).
- Welcome / email-verification flows (the port is reusable later).
- Frontend reset page (link target is configured via `FRONTEND_RESET_URL`).
- Resend domain verification + DNS records (runtime ops task; sandbox sender works for first-pass testing).
- Extracting `EmailSender` to `src/shared/` (defer until a second feature needs email).

## Commands & Tooling

- `npm run dev` — boots with `EMAIL_PROVIDER=console`, no Resend key required.
- `npm run migrate:development` — applies the new migration.
- `npm run test:unit -- features/auth` — use-case tests.
- `npm run test:integration -- auth` — HTTP-level tests.
- `npm run docs:openapi:generate` — regenerate OpenAPI after route changes.

## Environment / Dependencies

| Var                                   | Default                                  | Notes                                                       |
| ------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| `EMAIL_PROVIDER`                      | `console` (dev/test), `resend` otherwise | Adapter selector                                            |
| `RESEND_API_KEY`                      | —                                        | Required iff `EMAIL_PROVIDER=resend`; auto-redacted in logs |
| `EMAIL_FROM`                          | `onboarding@resend.dev`                  | Resend sandbox sender by default                            |
| `FRONTEND_RESET_URL`                  | `http://localhost:3000/reset-password`   | Embedded as `${URL}?token=…` in the email                   |
| `RATE_LIMIT_PASSWORD_RESET_EMAIL_MAX` | `3`                                      | Per-email per hour                                          |
| `RATE_LIMIT_PASSWORD_RESET_IP_MAX`    | `10`                                     | Per-IP per hour                                             |

New runtime dep: `resend` (npm).

## Verification

See "Verification" section in [plan](./password-reset-plan.md). End-to-end: register → forgot-password → grab link from console log → reset-password → login with new password.

## References

- [Plan / Ticket](./password-reset-plan.md)
- [Checklist](./password-reset-checklist.md)
- [Decisions](./decisions.md)
- Resend free-tier docs: https://resend.com/docs (100/day, 3000/month, sandbox sender)
- Existing migration style: `src/migrations/20250109160351-create-users.cjs`
- Existing rate-limiter pattern: `src/shared/middleware/rate-limiter.ts`
