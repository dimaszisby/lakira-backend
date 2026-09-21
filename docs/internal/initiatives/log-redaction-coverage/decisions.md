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
