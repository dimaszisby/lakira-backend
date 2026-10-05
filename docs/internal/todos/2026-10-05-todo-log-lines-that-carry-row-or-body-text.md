# Todo — two log lines still carry row data or request text

- **Status:** Open (P3)
- **Created:** 2026-10-05
- **Owner:** unassigned
- **Origin:** the security review of the T1 fix; kit
  [`log-redaction-coverage`](../initiatives/log-redaction-coverage/decisions.md) D-06 /
  [ADR-0059](../../explanation/decisions/adr-0059-an-error-passed-to-the-logger-is-reduced-to-an-allowlist.md)

---

## What

ADR-0059 reduces every error the logger is given. Two things it does not cover, by design, were
noted in review:

- `src/features/public/metric/infrastructure/http/controller.ts:144` logs
  `logger.error("Error mapping metric to DTO:", err, metric)`. The third argument is a whole metric
  row, which Winston merges onto the record. It is the user's own data, not a credential, and the
  line is reached only when the mapper throws.
- Message text is not scanned. `Database error: <message>` keeps Postgres's message, which quotes a
  submitted value in a few cases, and `Invalid JSON payload received <message>` quotes the first
  characters of a malformed body. ADR-0059 accepts this.

## Suggested fix

Log the metric's id, not the row. For message text, decide whether the two messages should be
replaced by fixed text plus `db.code`; that loses the one line of free text that makes a database
fault readable, so it is a judgment call, not a defect.
