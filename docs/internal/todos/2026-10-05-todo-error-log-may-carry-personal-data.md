# Todo — a database error is logged with the values bound to its statement

- **Status:** Open (P2). Confirmed by the dated run of 2026-10-05, where it is finding T1 and
  reopens caveat C6. It is the one item between the repo and a clean GOLD
- **Created:** 2026-10-05
- **Owner:** unassigned
- **Origin:** a note from the security review of the S8 fix; confirmed in
  `docs/internal/audits/saas-readiness/audit-2026-10-05.md` § 6, T1; kit
  [`saas-reaudit-2026-10-05`](../initiatives/saas-reaudit-2026-10-05/decisions.md) D-03

---

## What

`src/shared/middleware/error.ts:105-112` passes the error object to the logger as metadata in two
branches. Redaction is by key, and none of the keys a Sequelize error carries matches the pattern
in `src/config/sensitive-keys.ts`:

- A `DatabaseError` carries `sql` and `parameters`.
- A `UniqueConstraintError` has no `status`, so it takes the last branch and is logged whole before
  being answered as 409. It carries `fields`, `errors[].value`, `errors[].instance.dataValues` and
  `original.parameters`.

Reproduced on 2026-10-05 against a server in the JSON log format: twelve concurrent registrations
with one email answered one 201 and eleven 409, and each 409 wrote an `Error Occurred` line holding
the email address and the bcrypt hash of the submitted password. A double-submitted registration
form is enough. The development format prints the message only, which is why it was not seen.

## Suggested fix

Log a plain object for these errors: name, code, constraint and message, never the error itself.
Do not rely on adding `sql`, `parameters`, `fields` and `errors` to the redaction pattern alone,
since the next ORM error shape would get through the same way. Answer the unique-constraint case
at `warn`, as other client errors are.

Prove it with a unit test that logs a real `UniqueConstraintError` and a real `DatabaseError`
through the real logger format and asserts the bound values are absent. Integration tests cannot
see this: they do not read log output. Then a dated audit run to close C6.
