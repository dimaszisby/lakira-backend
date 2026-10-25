# Docs sweep — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Docs describe Render as today's target, with ADR-0042 as the planned replacement

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** ADR-0042 (a VPS running Compose) is Accepted but not implemented. CI still deploys
staging and production through Render deploy hooks (`.github/workflows/backend-ci.yml`, the
`deploy_staging` and `deploy_production` jobs). Some docs call Render the target. Some say
production will also run on Render, which contradicts the accepted decision.

**Decision.** Describe Render as the current deploy target, and point once to ADR-0042 as the
planned replacement. Correct only the statements that production _will_ stay on Render.

**Options considered.**

- _Rewrite deployment docs for the VPS._ Rejected. The VPS does not exist, so the docs would
  describe a system no one can use, and a reader following them would fail.
- _Leave every Render mention alone._ Rejected. Docs that say the future target is Render
  contradict an Accepted ADR.

**Consequences.** When ADR-0042 is implemented (twelve-factor TF-2), these pointers are where the
deployment docs get rewritten.

## D-02 — Dated snapshots get a banner, not a rewrite

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** The twelve-factor audit's §1 verdict and §2 scorecard still grade factor XI as a P0,
though TF-1, TF-3 and TF-11 have closed. The saas-readiness `README.md` still states the
2026-05-01 baseline as "today". Both are dated records.

**Decision.** Add a short banner saying the section is a dated snapshot and naming the live
section to read. Leave the historical content as written. The same applies to `archive/`.

**Options considered.** _Rewrite the verdicts._ Rejected: a dated audit's verdict is what was true
on that date, and rewriting it would falsify the record. The banner stops the misreading without
editing the history.

## D-03 — ADR status changes only with code evidence

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** The registry defines Proposed as "not implemented — do not assume the code matches
it". Several Proposed ADRs have shipped, so the registry tells readers not to trust code that in
fact matches. ADR-0016 describes a `requireAdmin` middleware that ADR-0030 replaced. Some
supersession links point in one direction only.

**Decision.**

- An ADR moves Proposed → Accepted only when its decision can be seen in the code, and the change
  cites the file that shows it.
- A partly implemented ADR stays Proposed, with a dated note saying what has landed and what has
  not.
- A replaced ADR is marked Superseded, and both ADRs link to each other.
- The registry row changes along with the ADR file.

**Consequences.** Status notes are added to ADRs, but decisions and their reasoning are left
alone. The workflow rule that ADRs flip to Accepted on merge is applied late, not changed.

## D-04 — Emojis are removed from dated records too; data emojis are kept

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** The user's global rule forbids emojis, and the user asked for them to be removed from
existing docs. Dated records (audit runs, closed kits, archive) are normally immutable.

**Decision.** Remove emoji markers everywhere in tracked Markdown, dated records included. This
changes presentation, not meaning: every replacement keeps the claim it replaces (a pass mark
becomes `Yes` or the word it preceded). Emojis that are **data** are kept: the folder-icon `icon` column
default in `database-schema.md` and the archived requirement docs, and the seed icons in
`seed-strategy.md`.

**Options considered.** _Exempt dated records._ Rejected: that is where most of the markers are
(about 470 of about 580 lines), so exempting them would leave the request mostly undone. Nothing
in those records changes meaning.

## D-05 — Wrong claims about missing tooling are corrected, not built

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** Some docs describe tooling that does not exist or does not work.
`docs/reference/commands.md` says it is "verified against `package.json`", but no check exists.
`test:ci -- --coverage` is documented as forwarding flags, but `scripts/test-ci.sh` drops them.

**Decision.** Fix the doc so it says what is true. File the tooling work as todos. This kit changes
no code.

**Consequences.** The docs stop overstating what is enforced. Each gap stays visible as a todo
instead of being fixed quietly.

---

## D-06 — A unit test checks `commands.md` against `package.json`

- **Status:** Proposed
- **Date:** 2026-10-25
- **Size:** Micro — single commit, no separate kit. Commits carry `refs: commands-doc-drift-check`.
  Register row B-56; branch `chore/commands-doc-drift-check`.

**Context.** D-05 corrected the page's claim to be "verified" and filed the missing check as a
todo (`2026-09-24-todo-commands-doc-drift-check.md`). On `dev` at `36c324b` the page held all 65
scripts, and named only two that do not exist, `migrate:dev` and `migrate:undo:dev`, in the note
that says they never existed.
**Decision.** `__tests__/unit/commands-doc.test.ts` fails when a script is missing from the page,
and when the page or `.claude/rules/commands.md` runs an `npm run` name that does not exist, brace
groups expanded. A script counts as documented as `` `npm run <name>` ``, as `` `npm start` `` or
`` `npm test` ``, or, for a name with a colon, bare in backticks, as variants such as `lint:fix` are
written. The two names that never existed are listed in the test, so no third one passes. Two
cases prove each check fails: a page with a row deleted, and one with a made-up script.
**Options considered.** _Generate the page from `package.json`:_ the descriptions are written by
hand and are what the page is for. _Count any backticked name:_ a plain name such as `build` would
pass through an unrelated word.
**Consequences.** Adding, renaming or removing a script fails the unit suite until the page
follows. A description that goes stale is not caught.
