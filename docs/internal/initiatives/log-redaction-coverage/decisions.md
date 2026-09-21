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
