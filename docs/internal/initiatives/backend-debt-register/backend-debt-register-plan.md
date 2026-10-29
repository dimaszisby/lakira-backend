# Backend debt register — Plan

- **Status:** In progress
- **Appetite:** one session — past that, cut analyses from the bottom of the list, not depth
- **Date:** 2026-10-13

## Context and goals

Open work is recorded in four places that do not rank against each other: the dated audit's
findings, the todo files, the Notion page shared with lakira-frontend, and notes in the frontend's
own todos. The repo's rules named no priority source, so every "what's next" was ranked from
scratch.

When this lands there is one ranked register that "what's next" is answered from, a written
analysis for each item worth fixing soon, and a rule in `.claude/rules/workflow.md` that says so.

## Acceptance criteria

- **AC-1** — `register.md` has a row for every open source item: each todo file not marked closed,
  each open audit finding, each live Notion record, and the three unraised frontend notes.
  _Why:_ a register that misses items is a second backlog, not a first.
- **AC-2** — Every row cites its source by path or section, and no row restates a todo's body.
  _Why:_ the docs rule against duplicated content.
- **AC-3** — D-01 is written before the register is ranked, and the order follows it with no
  exception left unexplained. _Why:_ a rule written afterwards bends to the result.
- **AC-4** — Each of the 11 analysed items has a file with all eight sections, and every claim
  about the code carries a `file:line` that exists at `bf72b58`. _Why:_ an analysis that cannot be
  checked gets redone when the fix starts.
- **AC-5** — Each analysis says what was not verified. _Why:_ the audit of 2026-10-12 showed that
  readings marked "inferred" are wrong often enough to matter.
- **AC-6** — `.claude/rules/workflow.md` names the register as the source for "what's next" and
  says how a row is added and closed. _Why:_ the owner's request; without it the register goes
  stale.
- **AC-7** — `format:check` passes and no file outside `docs/`, `.claude/rules/` and `CLAUDE.md`
  changes. _Why:_ this is a docs task.

## Open questions

- [ ] **Q-1** — Is `last=7d` meant to cover complete days only? The analysis calls the current
      behaviour a defect on the code's evidence and lays out both readings
      ([analysis](analysis-analytics-relative-range.md) § 3). The owner's call; it does not block
      this kit, it blocks that fix.

## Out of scope

- Fixing anything. Each fix is its own PR and cites its register row.
- In-depth analysis of the P3 rows, except the four the frontend is party to.
- The frontend repo. Its three unraised notes get a row each, marked as the frontend's to raise.
- A script that checks the register against the todo folder (row B-60).

## Decisions expected

- The ranking rule (D-01)
- How items group into fix PRs (D-02)
- What is listed and not analysed (D-03)

## Phases

### Phase 0 — kit and rule

Branch; README, plan, checklist; D-01 before any row is ranked.

### Phase 1 — the register

Every open todo, audit finding and Notion record becomes a row; then the rows are ranked by D-01.

### Phase 2 — the analyses

Eleven files, in register order, each read from the code at `bf72b58`.

### Phase 3 — the rule

`.claude/rules/workflow.md` § What's next; a pointer in `CLAUDE.md`; the backend todo for the
analytics defects.

## Risks and trade-offs

- **It goes stale.** A register nobody updates is worse than none. The rule makes a row part of
  filing a todo and part of closing one. Since 2026-10-29 the register is frozen and open work is in
  GitHub Issues (ADR-0085); `__tests__/unit/open-work-records.test.ts` keeps the record honest.
- **Severities are inherited.** The register ranks by what each source recorded. Seventeen rows have no
  recorded severity and sit in tier 5 until an audit grades them.
- **The analyses are one reader's.** They were written by the session that wrote most of the code
  in question. Each fix's own review is the check.

## References

- `docs/internal/audits/saas-readiness/audit-2026-10-12.md` § 4 and § 6
- `docs/internal/audits/saas-readiness/decisions.md`, ADR-008 and ADR-012
- The Notion page "FE and BE messages" (read 2026-10-13)
- lakira-frontend `docs/internal/todos/`, at `1edb13c`
