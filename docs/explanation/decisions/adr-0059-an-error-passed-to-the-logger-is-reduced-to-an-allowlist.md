# ADR-0059 — An error passed to the logger is reduced to an allowlist of its fields

- **Status:** Accepted
- **Date:** 2026-10-05
- **Related:** caveat C6 and finding T1 (`docs/internal/audits/saas-readiness/audit-2026-10-05.md`
  § 4.1, § 6);
  [ADR-0028](./adr-0028-sensitive-key-pattern-out-of-envmanager.md), the key pattern, which this
  does not change; [ADR-0049](./adr-0049-console-email-adapter-confined-to-dev-and-test.md);
  `.claude/rules/security.md` § Sensitive Data Handling
- **Origin:** `D-06` in the log-redaction-coverage kit —
  [`log-redaction-coverage`](../../internal/initiatives/log-redaction-coverage/decisions.md)

---

## Context

Redaction in this codebase is by key: a metadata key that matches the pattern in
`src/config/sensitive-keys.ts` is masked. That assumes the code chooses what it logs.

`logger.error(message, err)` breaks the assumption. Winston copies every own property of `err`
onto the log record. A Sequelize `DatabaseError` owns `sql` and `parameters`. A
`UniqueConstraintError` owns `fields`, `errors[].value`, `errors[].instance` and, through
`original`, the bound values again. None of those keys matches the pattern. The dated audit of
2026-10-05 sent twelve concurrent registrations with one email to a server in the JSON log format:
eleven were answered 409, and each wrote the email address and the bcrypt hash of the submitted
password to the log. That reopened caveat C6.

The call that did it is in `src/shared/middleware/error.ts`, but 17 call sites in `src/` pass an
error object to the logger, and any of them does the same the day a database error reaches it.

Review of a first fix found two more ways the same payload gets out, both confirmed by test:

- **A format token in the message.** Winston appends the error's own message to the log message,
  and a body-parser message quotes the request body. A body beginning `%j` therefore puts a token
  in the message, and Winston's `splat()` then prints the whole error object, raw body included,
  into the message text, where no key-based rule can see it.
- **An error as the only argument.** `logger.error(err)` makes the error itself the record, with no
  argument list to inspect.

## Decision

1. **The logger reduces every error it is given, before any other step runs.** A format at the
   front of the chain in `src/utils/logger.ts` replaces each `Error` among a log call's arguments
   with an allowlisted view, and removes from the record every key the original error contributed.
   It handles all three call shapes: an error beside a message, an error as the only argument, and
   an error as the `message` of a log entry. Nothing after it holds an error object, so nothing
   after it can copy or print one.
2. **The allowlist is ten scalar fields**: `name`, `code`, `errno`, `syscall`, `status`,
   `statusCode`, `expose`, `type`, `kind`, `isOperational`. A field is kept only if it is on the
   list and its value is a string, number or boolean.
3. **A database error also keeps `db: { code, constraint, table, column }`**, taken from the
   driver error it wraps. These are the SQLSTATE and schema names. `detail`, which quotes the
   offending values, is never kept.
4. **`message` and `stack` are untouched.**
5. **An error inside a metadata object is reduced the same way**, by `redactObject`, which the
   Sentry scrubber also uses.
6. **The record's own fields win.** An error that owns a key named `level`, `message`, `stack`,
   `service` or `release` does not replace the record's, and a metadata key passed beside an error
   keeps its value when the error owns a key of the same name.
7. **A duplicate is logged as a client error.** The error middleware logs a
   `UniqueConstraintError` at `warn`, as `Client error 409: Duplicate value`, with no object. The
   409 response is unchanged.

## Options considered

- **Change the three calls in `error.ts` only.** Rejected: it closes the reproduction and leaves
  14 call sites and every future one, which is how a caveat believed closed was reopened.
- **Add `sql`, `parameters`, `fields` and `errors` to the key pattern.** Rejected: it is a list of
  one ORM's field names, so the next error shape gets through; the pattern is shared with env-var
  masking; `errors` is a key the validation log uses on purpose; and it does nothing about a
  format token, which writes into message text.
- **Convert all 17 call sites to a helper that builds a safe object.** Rejected: it works until the
  eighteenth call site forgets, and nothing would notice.
- **Strip the keys after `splat()`.** Tried first, and rejected in review: by then `splat()` has
  already printed the error through any token in the message.
- **Drop everything an error contributes, with no allowlist.** Rejected: `code` and `statusCode`
  are how one Redis or socket failure is told from another, and the constraint name is what is
  wanted when a database fault is traced.
- **Forbid passing an error to the logger, by lint.** Rejected as the mechanism: it is the natural
  call, the 17 existing sites show it, and a rule that people work around protects less than a
  logger that is safe to call.

## Consequences

- **The shape of an error record changes.** `original`, `parent`, `sql`, `parameters`, `fields`,
  `errors` and any other custom property are gone; `db` may be present. Anything that parsed those
  keys from the log stream must change. Nothing in this repository does.
- **Context that is wanted in a log line is passed by name**, in a metadata object, where the key
  pattern applies to it. A custom property on an error is not a way to log something.
- **Message text is still not scanned.** `Database error: <message>` keeps Postgres's message, and
  Postgres quotes a submitted value in a few (`invalid input syntax for type uuid: "…"`). A
  body-parser message quotes the first characters of a malformed body. This residual is accepted:
  the message is what makes the line usable, and the values it can quote are short.
- **A plain object is not an error.** A rejection reason or a `cause` that is a plain object is
  redacted by key like any metadata, and an object nested five levels deep is passed through as
  before. Neither is new, and neither carries an ORM payload today.
- **The safety is tests on the real logger.** `__tests__/unit/utils/logger-error-payload.test.ts`
  logs real Sequelize error classes through the real format chain and reads the line: each call
  shape, each of four format tokens, a body-parser error with a raw body, an error that owns the
  record's key names. It fails if the format is removed or moved behind `splat()`.
- **Revert-safe.** No migration, no stored data, no change to any response.
