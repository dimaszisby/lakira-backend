# Todo — the error middleware's log lines may carry personal data

- **Status:** Open (P3, unverified)
- **Created:** 2026-10-05
- **Owner:** unassigned
- **Origin:** a note from the security review of the S8 fix; kit
  [`log-redaction-coverage`](../initiatives/log-redaction-coverage/decisions.md) D-05

---

## What

`src/shared/middleware/error.ts:107-112` writes an error's message into the log message, and for
the database and unexpected branches passes the error object as metadata. Redaction is by key and
does not scan message text. Two ways an email address could get through, neither demonstrated:

- A message that quotes user input. No `AppError` built from an address was found.
- A Sequelize `DatabaseError` passed as metadata. It carries `sql` and `parameters`, and neither
  key matches the pattern in `src/config/sensitive-keys.ts`. Whether the logger serializes them,
  and whether a failing auth query has an address among its parameters, was not checked.

## Suggested fix

First prove or rule out the second case: make an auth query fail in a unit test with the real
logger format, and read the line. If it leaks, log the database error's name, code and constraint
and not the object.
