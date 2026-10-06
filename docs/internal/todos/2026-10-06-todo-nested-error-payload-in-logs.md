# Todo — an error nested in log metadata is still written with its payload

- **Status:** Open (P3). Keeps caveat C6 open, and so blocks a clean GOLD
- **Created:** 2026-10-06
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-05-b.md` § 6, U1; kit
  [`saas-reaudit-2026-10-05-b`](../initiatives/saas-reaudit-2026-10-05-b/decisions.md) D-04

---

## What

ADR-0059 reduces an error that is passed to the logger as an argument. An error **inside** a
metadata object is reduced only by `redactObject`, which runs after `splat()` and stops at depth 5.
Reproduced through the real logger with a real Sequelize `DatabaseError`; each of these wrote the
email address, the password hash and the SQL text:

- `logger.error("x %j", { err })` and `logger.error("x %o", { err })`
- `logger.error("x %j", [err])`
- `logger.error("x", { a: { b: { c: { d: { e: { err } } } } } })`

These did not: `%s`, no token, and a top-level error with any token.

Nothing reaches it today. No message in `src/` contains a format token, and the three calls that
pass `{ err }` use constant messages. It is the kind of gap C6 was when it was written.

## Suggested fix

In `reduceLoggedErrors` (`src/utils/logger.ts`), walk each argument and replace every `Error` found
at any depth with its allowlisted view before `splat()` sees it, with a visited set against cycles.
Make `redactObject` reduce an error inside an object at the depth limit and not pass the object
through. Add the four call shapes above to `__tests__/unit/utils/logger-error-payload.test.ts`.

Correct ADR-0059 in the same change: its sentence "nothing after it holds an error object" is not
true as merged, and its items 4 and 5 are narrower in the code than in the text.

Review the fix against the whole of C6's text and not only these reproductions. Twice now a fix
has closed its reproduction and a grader has kept the caveat open on what it did not reach.
