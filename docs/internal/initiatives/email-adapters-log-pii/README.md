# Keep tokens and recipients out of logs

**Status:** Complete — gates green, awaiting PR. D-01..D-03 promoted to
[ADR-0049](../../../explanation/decisions/adr-0049-console-email-adapter-confined-to-dev-and-test.md).
**Slug:** `email-adapters-log-pii` · **Branch:** `fix/email-adapters-log-pii`

Lean kit — no plan; acceptance criteria live in the checklist.

`.claude/rules/security.md` says never to log passwords, tokens or PII. `ConsoleEmailSender` logs
every email's full text, reset and invite tokens included, and `ResendEmailSender` logs the
recipient's address on failure. This kit confines the console adapter to development and test,
and drops the recipient from the Resend log. Origin:
[`2026-09-26-todo-email-adapters-log-pii.md`](../../todos/2026-09-26-todo-email-adapters-log-pii.md).

- [Checklist](email-adapters-log-pii-checklist.md) — acceptance criteria, work items, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
