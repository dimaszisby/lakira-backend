# Decisions — log-and-ci-leaks

## D-01 — An error reaches the logger as the object, never its message

- **Status:** Accepted (#205, `53f6bce`)
- **Date:** 2026-10-21

**Context.** The logger masks a database error's quoted values (`maskDbText`, ADR-0059) when it is
handed the `Error`. Ten call sites handed it `error instanceof Error ? error.message : String(error)`
instead, a plain string the masker never sees, and `runInBackground` also put that string into the
message text. A Postgres message such as `invalid input syntax for type uuid: "…"` quotes what was
submitted (X3).
**Decision.** Each site passes the error itself (`{ error }`), and the logger's existing reduction
applies. Where the detail must be in the message text, as in `runInBackground`, it comes from
`loggableErrorMessage(error)`, exported by the logger: an `Error`'s masked message, or
`String(value)` for anything else. An `architecture.test.ts` case refuses the idiom under `src`.
**Options considered.** _Mask every string metadata value as if it were a database message:_
`maskQuotedValues` would eat quoted identifiers out of every message that has them. _Leave the
sites and mask at the call:_ ten copies of one rule, and the next site would not know it.
`MailpitEmailSender`'s `reason` is kept: it is a `fetch` failure, never a database message, and it
is the thrown `AppError`'s text.
**Consequences.** The `error` metadata of these lines is an object (`name`, `message`, allowlisted
fields), not a string.

---

## D-02 — One email pattern, applied to a URL's path as well

- **Status:** Accepted (#205, `53f6bce`)
- **Date:** 2026-10-21

**Context.** `cleanUrl` strips a URL's query and userinfo and masks network addresses, but keeps
the path, so an unmatched route's path could carry an address to Sentry (X5). The access log
writes the same path.
**Decision.** The email pattern moves from `sentry-scrub.ts` to `src/utils/mask-emails.ts`,
unchanged, as `EMAIL_IN_TEXT` and `maskEmails`. `cleanUrl` applies it after the query and userinfo
are gone, and the access log applies it to the path it writes. The probe skip compares the raw
path.
**Options considered.** _Run the whole `scrubText` over the path:_ it also replaces tokens and
query strings the path does not hold, and costs more on every request. _Log the matched route
template instead of the path:_ an unmatched route has none, which is the case at issue.
**Consequences.** A path segment holding an address reads `[email]` in Sentry and in the access log.

---

## D-03 — The CI token is read-only

- **Status:** Accepted (#205, `53f6bce`)
- **Date:** 2026-10-21

**Context.** `backend-ci.yml` declared no `permissions:`, so its `GITHUB_TOKEN` got the
repository default (X6). Every other workflow declares one.
**Decision.** `permissions: contents: read` at the top. Checkout reads; artifact upload uses the
runtime token, not `GITHUB_TOKEN`; no job writes to the repository or a PR.
**Options considered.** _Per-job blocks:_ every job needs the same, so one block says it once.
**Consequences.** A job that later needs to write (a PR comment, a release) declares it for itself.
