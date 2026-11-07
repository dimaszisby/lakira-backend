# ADR-0048 — Outbound email is readable locally through Mailpit; the `mailpit` provider is refused in production

- **Status:** Accepted
- **Date:** 2026-09-26
- **Related:** Extends [ADR-0010](./adr-0010-email-adapter-selected-by-email-provider.md) (adapter
  selected by `EMAIL_PROVIDER`) with a third adapter, and
  [ADR-0036](./adr-0036-refuse-production-unsafe-env-switches.md) (production-unsafe switches) with
  one more refused value. [ADR-0042](./adr-0042-vps-compose-deployment-topology.md) (the VPS stack
  that may run Mailpit in staging).
- **Origin:** `D-01`..`D-04` in the dev-mail-catcher kit —
  [`dev-mail-catcher`](../../internal/initiatives/dev-mail-catcher/decisions.md)

---

## Context

Verification, password-reset and invite flows each deliver a single-use token only by email. In
development, `EMAIL_PROVIDER=console` logged the email, but the development log format prints only
the message line and drops the metadata that holds the body. So no token could be read, and the
success paths of those flows were unverifiable outside a real inbox. lakira-frontend raised this as
a P1: it blocked verifying those flows, the one-user-two-organizations switcher test, and any
Cypress E2E of auth. It asked for a local mail catcher first, a stable log location second, and a
dev-only token endpoint third.

Invite sends are not wrapped in a try/catch, so a failed send makes the invite request return 500.
Verification and reset sends catch and log their failures.

## Decision

1. **Mailpit is the local mail catcher.** The Compose stack runs `axllent/mailpit:v1.31` (inbox
   and API on `8025`). The Compose `app` service always sends to it.
2. **`EMAIL_PROVIDER=mailpit` selects a `MailpitEmailSender`,** which POSTs each message to
   `${MAILPIT_URL}/api/v1/send` with Node's built-in `fetch`. A network error or non-2xx response
   is logged (subject and reason only; the recipient is PII) and thrown, as the Resend
   adapter throws.
3. **`mailpit` is refused when `NODE_ENV=production`,** in `zodEnv.ts`'s ADR-0036 `superRefine`
   block, so startup fails before listening. It is allowed in `staging`, for the VPS stack.
4. **The schema default for development stays `console`.** `.env.example` ships `mailpit`, and
   `.env.test.example` pins `console`, because `loadEnv` falls back to `.env` for anything the
   test file leaves unset.

## Options considered

- **MailHog.** Rejected: it is unmaintained (last commit 2024-02). Mailpit is its maintained
  successor.
- **MailDev, smtp4dev, MailCrab, Inbucket.** Rejected: they are open source and maintained, but
  have smaller communities, and MailDev's read API is thinner. Mailpit is MIT-licensed, has the
  largest maintained community (10.4k stars on 2026-09-26), and documents a read API
  (`/api/v1/search`, `/api/v1/message/{ID}`) that tests can call.
- **Generic SMTP via nodemailer.** Rejected: it adds a dependency, and a plaintext,
  unauthenticated transport would need its own production guard. The adapter is instead tied to
  Mailpit's API.
- **A stable log location for `console` mail.** Rejected: a log is not an API that Cypress can
  call, and the development log format would need to change.
- **A dev-only endpoint that returns the last token.** Rejected: it is new attack surface that has
  to be guarded out of production, and it would duplicate what the catcher does.
- **`mailpit` as the development schema default.** Rejected: a checkout without Mailpit running
  would fail every invite with 500.

## Consequences

- Locally, every email is readable in the inbox at `http://localhost:8025` or through its API.
  Verified live on 2026-09-26 for verify-email, reset-password (then login with the new password)
  and invite-accept (then `GET /organizations` lists two), with each token read from Mailpit's API.
- If Mailpit is down while the provider is `mailpit`, invites return 500 and verification and
  reset log the failure. That is the same behaviour as a Resend outage.
- Render staging keeps Resend, so staging tokens still arrive only in real inboxes until the VPS
  migration. Mailpit's send API is unauthenticated by default; a VPS deployment should set
  `MP_SEND_API_AUTH` and teach the adapter to send credentials.
- The refused set grows by one. `MAILPIT_URL` is masked in environment dumps by the URL suffix
  rule. There are now 70 env vars.
- No new npm dependency; the Compose stack gains one container.

## Links

- Kit: [`docs/internal/initiatives/dev-mail-catcher/`](../../internal/initiatives/dev-mail-catcher/README.md)
- How-to: [`docs/how-to/development/read-outbound-email.md`](../../how-to/development/read-outbound-email.md)
- Adapter: `src/features/shared/auth/infrastructure/providers/MailpitEmailSender.ts`
