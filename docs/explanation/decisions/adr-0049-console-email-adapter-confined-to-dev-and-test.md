# ADR-0049 — The console email adapter is confined to development and test; email adapters never log the recipient

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** Extends [ADR-0036](./adr-0036-refuse-production-unsafe-env-switches.md)
  (refused env switches), for the first time to staging.
  [ADR-0048](./adr-0048-mailpit-for-local-outbound-email.md) (Mailpit, which covers reading tokens
  locally). [ADR-0010](./adr-0010-email-adapter-selected-by-email-provider.md) (adapter selected by
  `EMAIL_PROVIDER`).
- **Origin:** `D-01`..`D-03` in the email-adapters-log-pii kit —
  [`email-adapters-log-pii`](../../internal/initiatives/email-adapters-log-pii/decisions.md)

---

## Context

`.claude/rules/security.md` says never to log passwords, tokens or PII. Two email adapters did:

- `ConsoleEmailSender` logged `to`, `subject` and the full `text` of every email. The text carries
  the verify, reset or invite link, token included, and a reset token works as a temporary
  password. The development log format prints only the message line, which is why it went
  unnoticed. The JSON format used outside development prints the metadata in full, and
  `src/config/sensitive-keys.ts` matches neither `to` nor `text`. `console` was the default only in
  development and test, but nothing stopped it being set in staging or production.
- `ResendEmailSender` logged `to`, the recipient's address, on every failed send.

Logs are read more widely, kept longer and copied further than the database, and a person cannot
be erased from them. The OWASP Logging Cheat Sheet and ASVS both exclude credentials and sensitive
personal data from logs.

## Decision

1. **`EMAIL_PROVIDER=console` is refused unless `NODE_ENV` is `development` or `test`.** The check
   sits in `zodEnv.ts`'s ADR-0036 `superRefine`, above the production-only early return, so it
   covers staging too. Startup fails before listening.
2. **`ConsoleEmailSender` keeps logging the body.** Showing the email is its purpose, and decision 1
   confines it to a developer's own terminal or a test run.
3. **Email adapters log failures without the recipient.** `ResendEmailSender` and
   `MailpitEmailSender` log the subject and the error only. The request id on every log line ties a
   failure to its request.

## Options considered

- **Stop the console adapter logging `to` and `text` everywhere.** Rejected: the adapter exists to
  show the email, and without the body it is nearly useless now that Mailpit covers reading tokens.
- **A runtime check inside the adapter.** Rejected, for ADR-0036's reason: the schema layer fails at
  boot, consistently, before any traffic.
- **Mask the recipient (`j\***@example.com`) or log the user id.** Rejected: the request id already
identifies the failure, and a user id would mean threading it through the `EmailSender` port
  for one log line.
- **Widen redaction to mask any value containing `token=`.** Deferred: it is value-based matching,
  a different mechanism with its own false-positive and cost questions. It is not needed once
  decisions 1 and 3 remove every known leak.

## Consequences

- No adapter writes a token to a log outside development and test.
- The refused set now covers staging as well as production, for this one value. An environment
  that relied on `console` in staging must switch to `resend`, or to `mailpit` on the VPS stack.
- `loadEnv` falls back to `.env` for anything an environment file leaves unset. A local
  `.env.staging` without `EMAIL_PROVIDER` therefore inherits `.env`'s value, which is often
  `console`, and refuses to start until it names a provider.
- The guard only works when `NODE_ENV` is set. An image run without it defaults to `development`,
  which is tracked separately in `docs/internal/todos/2026-09-27-todo-docker-image-sets-no-node-env.md`.

## Links

- Kit: [`docs/internal/initiatives/email-adapters-log-pii/`](../../internal/initiatives/email-adapters-log-pii/README.md)
- Rule: `.claude/rules/security.md`, Sensitive Data Handling
