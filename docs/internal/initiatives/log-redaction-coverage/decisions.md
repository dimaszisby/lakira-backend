# Log redaction coverage — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Some redaction terms become unanchored; `hash` deliberately does not

- **Status:** Accepted
- **Date:** 2026-09-21

**Context.** `SENSITIVE_KEY_PATTERN` is `/(password|secret|token|key|certificate|url)$/i` — anchored
to the **end** of the key. C6 reports that it therefore misses `authorization`, `cookie`, `bearer`
and `passwordHash`. Verified: all four test `false`.

**Decision.** Move `password` and `secret` to unanchored, add `authorization`, `cookie` and `bearer`
as unanchored, and leave `token|key|certificate|url` suffix-anchored:

```
/password|secret|authorization|cookie|bearer|(token|key|certificate|url)$/i
```

**Options considered.**

- _Add `hash` as a suffix term._ Rejected, and this is the one worth recording. It would catch
  `passwordHash`, but it would also redact `etagHash`, `contentHash` and every other digest field.
  This repo has live ETag logic (`makeEtag` / `deriveEtagSeed`), so redacting hash-suffixed keys
  would actively destroy the information needed to debug the analytics conditional-request work.
  Unanchoring `password` catches `passwordHash` without that cost.
- _Make every term unanchored._ Rejected: `url` and `key` unanchored would match `keyword`,
  `urls`, `sortKey`-style fields and quietly strip useful debugging context. Over-redaction is
  safer than under-redaction but it is not free.
- _Keep a second, separate pattern for HTTP header names._ Rejected as premature — one pattern with
  two anchoring styles is already understood by both call sites (`logger.ts`, `envManager.ts`), and
  a second pattern is a second thing to drift.

**Consequences.** `passwordConfirmation` now redacts too, which is a genuine gain — it is a real
field on `POST /auth/register`. `monkey` and similar keys ending in `key` were already redacted and
remain so; that is pre-existing behaviour, not a regression. Both call sites change behaviour
together, which is intended: an env var named `COOKIE_DOMAIN` masking its value is correct.

---

## D-02 — C5 is fixed **and** its severity claim corrected, not simply closed

- **Status:** Accepted
- **Date:** 2026-09-21

**Context.** C5 reads "Sentry has no PII scrubbing — `Sentry.init()` lacks a `beforeSend` to strip
`authorization`/`cookie`/body secrets before egress." A previous session doubted the premise on the
grounds that modern `@sentry/node` defaults `sendDefaultPii: false`.

Both halves check out, and they point in different directions. `Sentry.init()`
(`src/server.ts:60-66`) genuinely has no `beforeSend`. But the installed version is **10.69.0**,
where `sendDefaultPii` defaults to `false`, so headers, cookies and request bodies are **not**
auto-attached. The row's severity is overstated: the main PII egress path it describes is already
closed by the SDK default.

**Decision.** Do both — add a `beforeSend` that strips request headers and cookies before egress,
**and** correct the audit row to state what was actually true. Closing the row by argument alone
would leave the next reader to re-derive the same doubt.

**Options considered.**

- _Close the row as overstated, write no code._ Rejected: `sendDefaultPii: false` governs what the
  SDK attaches automatically. It does not govern what application code passes explicitly via
  `captureException` context, or what rides along on an error object. `beforeSend` is the only
  thing that covers those, and it is ten lines.
- _Leave the row open and write the code without touching the wording._ Rejected: the row would
  stay as evidence for a claim that is not accurate, and this is the second session to spend effort
  doubting it. Audit rows that overstate cost real time — one has already misled a handoff here.

**Consequences.** The audit's C5 row gains a dated note in the style of the existing C2 note,
recording the version-default finding rather than silently rewriting history.

---

## D-03 — Broadening the pattern does not supersede ADR-0028

- **Status:** Accepted
- **Date:** 2026-09-21

**Context.** [ADR-0028](../../../explanation/decisions/adr-0028-sensitive-key-pattern-out-of-envmanager.md)
is `Accepted` and quotes the exact regex this kit changes. Records are immutable, so the question is
whether broadening the terms supersedes it and needs a new numbered record.

**Decision.** No. ADR-0028 decides **where** the pattern lives — one module, `sensitive-keys.ts`,
imported by both call sites instead of inlined twice. That decision is untouched and is in fact what
made this change a one-line edit. The regex appears in its Context section as a description of the
then-current value, not as the decision itself.

**Options considered.**

- _Write a superseding ADR._ Rejected: it would claim ADR-0028 no longer holds, which is false, and
  leave a reader thinking the single-source-of-truth rule had been revisited.
- _Edit ADR-0028's quoted regex to match._ Rejected outright — records are immutable, and editing
  one to stay current is precisely what the immutability rule exists to prevent.

**Consequences.** ADR-0028 now quotes a regex that is one commit out of date in its Context section.
That is correct and expected: it records what was true on 2026-05-06. The live value is in
`src/config/sensitive-keys.ts`, which is what both the rule file and the how-to now point at rather
than restating.

---

## D-04 — `dsn` added, and three docs that #104 missed

- **Status:** Accepted
- **Date:** 2026-09-21
- **Size:** Micro — single commit, no separate kit. This is the same concern as D-01, so it is
  logged here rather than spawning an initiative for a one-term regex change.

**Context.** Two problems surfaced immediately after #104 merged.

`SENTRY_DSN` matches no term in the pattern — it ends in "DSN" — so its value is written to logs in
the clear. A Sentry DSN is a write credential: anyone holding it can post events into the project.
`.claude/agent-memory/security-reviewer/project_scan_2026_06_05.md:20` flagged this on 2026-06-05
and it was never actioned.

Separately, #104 updated only two of the five live documents that quote the pattern. The search
behind it was scoped to a file list rather than the repository, so
`.claude/agents/security-reviewer.md`, `.claude/rules/environment.md` and
`docs/reference/configuration.md` were left stating the pre-#104 regex — including a **live agent
instruction**, which would have had the security-reviewer asserting something false.

**Decision.** Add `dsn` as a suffix term. Update all three missed documents, and stop most of them
restating the pattern at all — they now point at `src/config/sensitive-keys.ts`. The two that
legitimately need the terms spelled out for a reader (`read-application-logs.md`,
`configuration.md`) state them _and_ name the module as authoritative.

**Options considered.**

- _Unanchor `dsn`._ Rejected: no benefit, and it would match any key containing "dsn" as a
  substring for no reason. `SENTRY_DSN` and any `*_DSN` are suffix matches.
- _Leave the three docs and rely on the module being the source of truth._ Rejected: a live agent
  instruction stating a wrong security control is worse than a stale prose doc, and the rules file
  is loaded into context every session.
- _Delete the terms from every doc and point only at the module._ Rejected for the how-to and the
  reference — a reader learning how redaction works needs to see what matches without opening
  source. Those two keep the list and cite the module.

**Consequences.** Five documents now quote or cite one pattern. The three that merely mention the
behaviour cite the module only, so there are two copies to keep current instead of five. Nothing
gates this — the drift that produced this entry would not have been caught by CI, which is worth
remembering if the pattern changes a third time.

**Commit:** filled on merge — see the PR for this branch (`fix/redaction-doc-drift`).

---

## D-05 — Limiter log lines name a user id or an email hash, never the address

- **Status:** Accepted
- **Date:** 2026-10-05
- **Size:** Micro — single commit, no separate kit. Audit finding S8 (P2). Commits carry
  `refs: limiter-logs-email-address`.

**Context.** Two limiter log lines put an email address in the message text: the password-reset
email limiter logged the address from the request body, and the email-verification email limiter
logged `req.user.email`. Redaction is by metadata key (D-01), so text inside a message is never
masked, and `.claude/rules/security.md` says never to log PII. Both lines predate ADR-0057, which
kept every limiter line as it was.

**Decision.** The email-verification limiter runs behind authentication and logs the user id, as
the switch-org limiter does. The password-reset limiter has no user, so it logs
`hashEmail(address)`: SHA-256 of the trimmed, lower-cased address. That function moves out of
`loginLockout.ts` into `src/utils/email-hash.ts` and both use it, so a limiter line and an
`auth.lockout.triggered` line for one address carry the same hash. Each line still falls back to
the IP.

**Options considered.**

- The IP only: rejected. The limiter is keyed on the address, so the line would no longer say
  which key was hit, and one address tried from many IPs would look like unrelated events.
- A masked address such as `s***@example.com`: rejected. It is still personal data, and it does
  not identify one address.
- The address as metadata under an `email` key: rejected. The key pattern has no `email` term, so
  it would be written in the clear, and it would change `limitExceeded`, which ADR-0057 fixes as a
  message and a line.
- A second copy of the hash function in `rate-limiter.ts`: rejected. `src/shared/` may not import a
  feature (ADR-0058), which is why the function moves, and two copies would drift apart and stop
  matching.

**Consequences.** The hash is unsalted, so someone who holds the logs and guesses an address can
confirm it. That is pseudonymous, not anonymous; it is the trade `loginLockout` already makes, and
it is what lets the two lines be matched. The limiter **store keys** still hold the address in
Redis for the hour of the window; that is not a log line and is filed as
`docs/internal/todos/2026-10-05-todo-limiter-keys-hold-email-address.md`.

---

## D-06 — An error passed to the logger is reduced to an allowlist of its fields

- **Status:** Accepted
- **Date:** 2026-10-05
- **Size:** Micro — single commit, no separate kit. Audit finding T1 (P2), which reopened caveat
  C6 in the dated run of 2026-10-05. Commits carry `refs: error-log-bound-values`.

Promoted to the architecture decision registry as **[ADR-0059](../../../explanation/decisions/adr-0059-an-error-passed-to-the-logger-is-reduced-to-an-allowlist.md)**.
That file is authoritative; this entry is a pointer.

---

## D-07 — Everything a log call is given is sanitised before any step that can print it

- **Status:** Accepted
- **Date:** 2026-10-06
- **Size:** Micro — single commit, no separate kit. Audit finding U1 (P3), which kept caveat C6
  open in the second dated run of 2026-10-05. Commits carry `refs: nested-error-payload-in-logs`.

**Context.** ADR-0059 (D-06) reduces an error only when it is a top-level argument of a log call.
The dated run reproduced four shapes that still wrote a database error's SQL, the email address and
the password hash: an error inside a metadata object or an array, formatted by a `%j` or `%o`
token, and an error five levels deep. There are two causes. `splat()` prints an argument whole
through a token before key redaction runs, and `redactObject` returns an object at depth 5 as it
is. Read against the whole of C6, the same two causes leak more than errors:
`logger.info("x %j", { password })` writes the password into the message text, because with a
token in the message Winston does not copy the metadata onto the record and key redaction never
sees it; and a sensitive key five levels deep is written unredacted. Twice now a fix has closed its
reproduction and a grader has kept C6 open on what the fix did not reach.

**Decision.** The fix is aimed at the two causes and not at the four shapes.

1. The format at the front of the chain sanitises every argument of the call, and every value
   Winston has already copied onto the record, before `splat()` runs: errors are reduced to their
   allowlisted view wherever they sit, and sensitive keys are masked. It writes copies; the
   caller's objects are not changed.
2. `redactObject` fails closed at its depth limit. An object or an array at depth 5 is replaced by
   the string `[Truncated]` and not passed through.
3. The redaction step at the end of the chain stays, as a second pass over anything a later step
   adds.

**Options considered.**

- _Walk the arguments to any depth and replace only errors, with a visited set against cycles_ (the
  todo's suggestion). Rejected: it closes the four shapes and leaves a sensitive key behind a token
  or below the depth limit, which is C6's own text. An unbounded walk also has an unbounded cost on
  a log call, where a bounded one that drops what it does not reach has neither problem, and the
  depth bound already bounds a cycle.
- _Raise the depth limit._ Rejected: any limit that passes the remainder through has the same gap
  one level further down.
- _Move `splat()` behind the redaction step._ Rejected: redaction works on the record's keys, and
  with a token in the message the metadata is not on the record until `splat()` has run.
- _Forbid format tokens in log messages, by lint._ Rejected as the mechanism for the same reason
  ADR-0059 rejected a lint rule: a message can carry a token the caller never wrote.

**Consequences.** A value nested deeper than five levels is no longer logged, nor sent to Sentry in
`extra`, `contexts` or request data, since the scrubber shares `redactObject`; no call in `src/`
logs metadata that deep. Each log call copies its metadata once more. ADR-0059 is corrected in the
same change: its sentence that nothing after the first format holds an error object was not true as
merged. This amends that record and takes no new number; the boundary and the mechanism are the
same, and the reach is wider. Message text is still not scanned, and a plain object carrying `sql`
or `parameters` keys is still metadata that no term matches.

## D-08 — A cache entry is named in a log line by its namespace and a hash, never by its key

- **Status:** Accepted
- **Date:** 2026-10-08
- **Size:** Micro — single commit, no separate kit. The reviewer of D-07 kept caveat C6 open on
  it (P3). Commits carry `refs: cache-key-in-log-message`.

**Context.** Redaction is by metadata key and does not scan message text, and D-07 left that as
it was. `src/shared/middleware/cache.ts` writes the cache key into three `info` messages, and
passes it as `{ cache: key }` to the background write, which logs it on failure under a name no
term matches. The three cursor key builders (metric, metric-settings, metric-log) put the search
text `q`, a name or value filter and the `after` cursor into the key, so a search for an email
address is written to the production log. `src/utils/redis-client.ts` writes the key on
invalidation, and on a pattern invalidation it passes the array of every deleted key to the
logger. Two more lines of the same class were on file
([todo](../../todos/2026-10-05-todo-log-lines-that-carry-row-or-body-text.md)): the metric
controller passes a whole metric row to the logger when its mapper throws, and the error handler
passes the body parser's error, whose message quotes the start of a malformed body and which
Winston appends to the line.
**Decision.** A log line names a cache entry by `cacheEntryName(key)`
(`src/utils/cache-entry-name.ts`): the key's namespace, then `#`, then the first 12 hex characters
of the SHA-256 of the whole key, for example `cursor:metrics:v3#3fa9c1d2e4b7`. The namespace is
`cursor:<feature>:v<n>` for a cursor key and the first segment for any other, and is replaced by
`unknown` unless it is a plain token. The name is in the message, since the development format
prints no metadata. The pattern line reports how many entries it deleted and not which. The
mapping failure logs the metric's id. The malformed-body line is a fixed message with the parser's
error type and without the error. The keys read from and written to Redis do not change.
**Options considered.**

- _Rename the metadata key so the pattern masks it._ Rejected: it hides the entry altogether, and
  the lines exist to follow one entry from miss to store to hit.
- _Hash only the `q` and filter segments when the key is built._ Rejected: every key builder, and
  every new one, would have to remember to, and the key in Redis would change with it.
- _An HMAC with a secret._ Rejected: a new secret to provision and rotate for a P3, when
  `hashEmail` already names an address by a plain SHA-256.
- _Replace `Database error: <message>` with fixed text as well._ Not taken: the owner's scope
  decision of 2026-10-08. ADR-0059 accepts that line and stands.

**Consequences.** The hash is unsalted, as `hashEmail` is. Someone who holds the logs and a user's
id and organization id can confirm a guessed search term by hashing the key it would produce; they
cannot read the term from the line. One key keeps one name for its whole life, and two keys in one
namespace differ only by hash, so a line no longer shows which user or which filter it was for; the
request id on the same line does. `metric-log`'s router still logs `{ key }` at `debug`, which the
pattern already masks. `Database error: <message>` and the Zod field messages are unchanged.

## D-09 — The lines that echo a request are logged by field, code and type

- **Status:** Accepted
- **Date:** 2026-10-08
- **Size:** Micro, in the same commit as D-08 (`refs: cache-key-in-log-message`). A fork found in
  review, decided by the owner the same day.

**Context.** A security reviewer, given the whole of C6 and not told what D-08 does, graded its
five lines closed and C6 still open on one more that anything on the internet can reach: a failed
validation is logged with Zod's messages, and Zod's default messages repeat the input.
`?sortOrder=victim@example.com` gives `Invalid enum value. Expected 'ASC' | 'DESC', received
'victim@example.com'`, and a `.strict()` schema names every unknown key it was sent (reproduced on
Zod 3.25.76). It is the query string the access log drops, written back at `error`. The reviewer
named three smaller lines of the same kind: the client-error line prints the raiser's message,
which quotes an undecodable path segment or a charset header; the metric-settings repository logs
the search term `q` at `debug`, the default level outside production; and a cache entry that does
not parse is logged with `JSON.parse`'s message, which quotes the start of the stored response.
**Decision.** All four are changed in this commit. A failed validation is logged as
`{ issues: [{ field, code }] }`, Zod's issue code and not its message. The client-error line names
the raiser's `type` when it is a plain token and the error's class name otherwise. The `q` line is
removed. A cache entry that does not parse is logged by its name and treated as a miss, in the
middleware and, after a second review, in the three other readers of a stored value
(`readCachedJson` in `src/shared/cache/read.ts`; the two visualization reads and the category
cache). The 400
body the client receives is not changed: it still carries Zod's messages, which tell the caller
what it sent.
**Options considered.** A global Zod `errorMap` with messages that never repeat the input:
rejected here, it changes every 400 body, which the frontend reads and the OpenAPI examples
describe. Leaving them for a todo: rejected by the owner, since the next dated run would keep C6
open on the validation line. Redacting credentials from the startup errors for a bad
`DATABASE_URL`, `REDIS_URL` or `RABBITMQ_URL` in the same change: not taken, it is a credential on
stderr at boot and not request text, and is filed as its own
[todo](../../todos/2026-10-08-todo-startup-error-prints-connection-url.md).
**Consequences.** A validation line no longer says what was wrong with the value, only which field
and which rule; the request id on the line finds the response. A field path can still hold a key
the client chose when the schema is a record; no schema in `src/` is one today. Left as they are,
and named so a later reader does not take them for oversights: `Database error: <message>`
(ADR-0059), `Error Occurred: <message>` for an `AppError` the application wrote, the email
adapters' provider messages, and SQL text at `debug` under `DB_LOGGING`.

## D-10 — A startup error for a bad connection URL names the variable, never the URL

- **Status:** Proposed
- **Date:** 2026-10-10

Micro entry for finding V1 of `audit-2026-10-10.md`
([todo](../../todos/2026-10-08-todo-startup-error-prints-connection-url.md)), one of the two routes
caveat C6 closes on (ADR-012 of the audit folder). Commits carry
`refs: c6-startup-url-db-logging`.

**Context.** When `REDIS_URL`, `RABBITMQ_URL` or the environment's database URL failed validation,
`src/config/zodEnv.ts` threw an error whose message held the whole URL. `envManager.ts` printed
that message in its `[ENV_ERROR]` line with `console.error`, and Node printed it again when the
module-level `loadEnvOrExit()` threw. A typo in a production URL put the database or broker
password on stderr twice. The `envSample` in the same line was already masked. The database
message also said `DATABASE_URL` whichever variable had been read.
**Decision.** The message is `<VARIABLE> is invalid: <reason>`, with the variable actually read
and no part of its value. The reason is this file's own fixed text or Node's `Invalid URL`, whose
message does not carry the input.
**Options considered.** Masking the password and keeping the rest of the URL: rejected, the user,
host and database name are still deployment detail, and a URL that does not parse cannot be
searched for its password. Routing the startup error through the logger: rejected, the logger
imports the env manager, and message text is not redacted anyway. Masking in `logEnvFailure`
alone: rejected, Node's own print of the thrown error would still carry it.
**Consequences.** An operator sees which variable is wrong and why, and has to look at the value
where it is set. Nothing else about startup changes.

## D-11 — `DB_LOGGING` is refused in production

- **Status:** Proposed
- **Date:** 2026-10-10

Micro entry for finding V2 of `audit-2026-10-10.md`
([todo](../../todos/2026-10-10-todo-db-logging-writes-sql-values.md)), the other route caveat C6
closes on. Commits carry `refs: c6-startup-url-db-logging`. D-09 named "SQL text at `debug` under
`DB_LOGGING`" as left alone; this entry replaces that for production.

**Context.** With `DB_LOGGING=true`, `src/config/db.ts` hands Sequelize's statement text to
`logger.debug`. Sequelize inlines the values of a `WHERE` clause, so a login writes the address it
looked up. The text is a message and is never redacted. Development and production honoured the
switch; staging and test were already off. `src/config/config.cjs`, which sequelize-cli reads
without running the schema, honoured it for production migrations.
**Decision.** The schema refuses `DB_LOGGING=true` when `NODE_ENV=production`, beside the other
refused switches (ADR-0036), and `config.cjs` sets production `logging: false`. Development keeps
the switch.
**Options considered.** Stripping values from the statement: rejected, Sequelize hands over a
finished string and there is no reliable way to tell a value from SQL. Refusing it everywhere:
rejected, it is the documented way to see statements locally. Logging placeholders only: not
available for inlined `WHERE` values without replacing the query generator.
**Consequences.** A production deployment that sets `DB_LOGGING=true` no longer starts, and says
why. SQL cannot be read from production logs; a failing statement is reproduced locally. In
development the log still holds statement values, which is the developer's own data.
