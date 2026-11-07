# Log redaction coverage — Checklist

Lean kit: no plan, so the acceptance criteria are stated here.

## Acceptance criteria

- **AC-1** — `SENSITIVE_KEY_PATTERN` redacts `authorization`, `cookie`, `bearer` and
  `passwordHash`.
  _Why:_ SaaS-readiness caveat C6. The pattern is suffix-anchored, so all four currently pass
  through unmasked.
- **AC-2** — Keys that are not sensitive still pass through: `username`, `email`, `author`,
  `authorId`, `etagHash`, `description`, `PORT`.
  _Why:_ over-redaction destroys debugging context. `etagHash` and `authorId` are the two this
  change could plausibly break — see [D-01](decisions.md).
- **AC-3** — `Sentry.init()` has a `beforeSend` that strips request headers and cookies before
  egress.
  _Why:_ SaaS-readiness caveat C5. `sendDefaultPii: false` covers what the SDK attaches on its own,
  not what application code passes explicitly.
- **AC-4** — The C5 audit row records the `@sentry/node` v10 default-finding, so the next reader
  does not re-derive the same doubt for a third time.
  _Why:_ two sessions have now spent effort doubting this row's severity.
- **AC-5** — C6 and C5 are flipped to Fixed in `FINAL-AUDIT-SUMMARY.md` § 4, per that file's own
  fix-status convention.

## Work items

- [x] `__tests__/unit/utils/logger-redact.test.ts` — five cases for the C6 misses, six for the
      AC-2 non-matches. **Run against `dev` first: 5 failed, 13 passed** — the five gaps failed and
      all six over-redaction guards already passed, so they act as regression cover.
- [x] `src/config/sensitive-keys.ts` — pattern per [D-01](decisions.md), with the two anchoring
      styles documented in the module
- [x] `src/utils/sentry-scrub.ts` — `scrubSentryEvent`, a testable pure function rather than an
      inline closure in `server.ts`
- [x] `src/server.ts` — `beforeSend: scrubSentryEvent`
- [x] `__tests__/unit/utils/sentry-scrub.test.ts` — six cases
- [x] `docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md` — C6 Fixed, C5 Fixed + dated note,
      and the § header line that still said "C4, C5 and C6 remain open-unchanged"
- [x] `.claude/rules/security.md` — restated, and now points at `sensitive-keys.ts` as the source
- [x] `docs/how-to/development/read-application-logs.md` — same regex quoted, same fix

## Discovered

- [x] Found: the regex was quoted verbatim in **two** docs beyond the audit —
      `.claude/rules/security.md:35` and `read-application-logs.md:116`. → **in scope**, both
      updated. Neither is generated or gated, so nothing would have caught the drift.
- [x] Found: [ADR-0028](../../../explanation/decisions/adr-0028-sensitive-key-pattern-out-of-envmanager.md)
      quotes the old regex in its Context section. → **deliberately not touched**; see
      [D-03](decisions.md). Records are immutable and that ADR decides _where_ the pattern lives,
      not what is in it.
- [x] Found: `passwordConfirmation` was also unredacted — not named in C6, but it is a real field
      on `POST /auth/register`. → **in scope**, covered by unanchoring `password`.

## Acceptance

- [x] AC-1 — `logger-redact.test.ts` › masks authorization / cookie / bearer / passwordHash
- [x] AC-2 — `logger-redact.test.ts` › leaves username / email / author / authorId / etagHash /
      description untouched; `envManager.test.ts` › leaves non-sensitive keys untouched (`PORT`)
- [x] AC-3 — `sentry-scrub.test.ts` › redacts credential headers, drops the cookies collection
- [x] AC-4 — C5 note added, dated 2026-09-21, in the style of the existing C2 note
- [x] AC-5 — both rows flipped. **SHA not yet filled** — unknowable before the commit exists; see
      Review.

## Gates

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0
- [x] tests — `test:unit` exit 0 (586 passed, 91 suites, +17); `test:integration` exit 0
      (196 passed, 5 skipped). Run separately.
- [x] build — exit 0
- [ ] OpenAPI — **skipped**, no route, Zod schema or `src/lib/openapi/**` change.
- [ ] security delta — **skipped**, no dependency added, upgraded or removed.

---

## Review

**Outcome.** C6 and C5 both closed. The redaction pattern now catches the four keys C6 named plus
`passwordConfirmation`, and Sentry events pass through a scrubber before egress.

**C6 was exactly as reported.** Verified before building: `authorization`, `cookie`, `bearer` and
`passwordHash` all tested `false` against the old suffix-anchored pattern.

**C5 was not.** The row claims "Sentry has no PII scrubbing", implying headers, cookies and bodies
were egressing. They were not — `@sentry/node` 10.69.0 defaults `sendDefaultPii: false`. The real
gap was the narrower one the row does not mention: explicitly-passed context. Fixed, and the row
annotated rather than rewritten, because this is the **second** session to spend effort doubting it
and the third should not have to.

**The interesting half of this change was what _not_ to redact.** Adding `hash` as a term would
have caught `passwordHash` in one character, and would also have redacted `etagHash` — destroying
exactly the context needed to debug the analytics conditional-request work. Six negative test cases
guard that, and they passed before the change as well as after, which is what makes them regression
cover rather than decoration.

**One loose end:** the audit's fix-status convention asks for a commit SHA alongside (pass), which
cannot exist before the commit does. C6/C5 currently read Fixed without one. Either fill them in a
follow-up, or accept that C1/C3 carry SHAs and these two carry a dated note instead.
