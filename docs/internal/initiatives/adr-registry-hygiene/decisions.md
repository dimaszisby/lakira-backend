# Decisions — adr-registry-hygiene

## D-01 — A stale record gets a dated status note, not a rewrite

- **Status:** Accepted (#213, `f8b9ff8`)
- **Date:** 2026-10-23

**Context.** A1020 § 4.5 lists nine records with a statement that no longer holds; X46 adds that
ADR-0061 and ADR-0070 state wiring ADR-0072 replaced, with no link to it. ADR-0054, ADR-0076 and
ADR-0074 (decisions 2 and 7) gained notes in later PRs. ADR-0056, 0061, 0067, 0069, 0070, 0073
and ADR-0074's decisions 1 and 6 did not.
**Decision.** Each of the seven gets a `> **Status note (2026-10-23).**` block under its header,
below any note it already has. A note names the sentence that no longer holds, says what holds on
`dev` now, links the record that changed it, and cites the finding. Every code name a note cites
was checked under `src`.
**Options considered.** _Edit the decision text:_ a record says what was decided then; rewritten,
it no longer shows why the later record was needed. _Mark a record Superseded:_ each decision
still stands except for the wiring or the detail it names.
**Consequences.** No status changes, so the registry in `docs/explanation/decisions/README.md` is
unchanged. A reader of a stale sentence meets the note first.

---

## D-02 — B-83 closes

- **Status:** Accepted (#213, `f8b9ff8`)
- **Date:** 2026-10-23

**Context.** #211 fixed X47, X50, X51 and R11's rest; #212 fixed X48, X49, X52 and X43's rest;
this branch takes X46 and § 4.5. B-88, found by #212, is a row of its own.
**Decision.** B-83 moves to the register's Closed section, naming both PRs and this branch. Its
confirmation column says a dated run must confirm it, as the other rows of the 2026-10-20 run do.
**Options considered.** _Keep the row open until a run confirms it:_ the register moves a row when
its fix is written (`.claude/rules/workflow.md` § What's next) and records the confirmation owed.
**Consequences.** The 2026-10-20 run's architecture items are all fixed or filed (B-88).
