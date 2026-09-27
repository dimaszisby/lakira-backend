# Todo — the email adapters log recipients, and the console adapter logs tokens

- **Status:** Open
- **Created:** 2026-09-26
- **Owner:** unassigned
- **Origin:** found in review by the `dev-mail-catcher` kit, whose new adapter avoided the same
  pattern

---

## What

`.claude/rules/security.md` says never to log passwords, tokens or PII. Two existing adapters do:

- `ResendEmailSender` logs `to` (an email address, which is PII) on a send failure.
- `ConsoleEmailSender` logs `to`, `subject` and the full `text` of every message. The text holds
  the verification, reset or invite link, token included. None of those keys matches the redaction
  pattern in `src/config/sensitive-keys.ts`, so nothing is masked.

The development log format prints only the message line, which is why this went unnoticed. The
JSON format used outside development prints the metadata in full. `console` is the default only
for development and test, but nothing stops `EMAIL_PROVIDER=console` being set in staging.

`MailpitEmailSender` (ADR-0048) logs the subject and failure reason only.

## Suggested fix

- `ResendEmailSender`: drop `to` from the failure log, as `MailpitEmailSender` does.
- `ConsoleEmailSender`: decide whether it should exist outside development and test at all now
  that Mailpit covers local reading. Either refuse it outside `development`/`test` (another
  ADR-0036 row), or stop logging `text` and `to`. If it keeps logging the body for local use,
  confine that to `NODE_ENV=development`.
