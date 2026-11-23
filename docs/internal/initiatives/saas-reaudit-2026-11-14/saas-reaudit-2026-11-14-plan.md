# SaaS re-audit, dated run of 2026-11-14 — Plan

- **Status:** Done
- **Appetite:** 3 days — past that, cut the reproductions of P3 grounds rather than extend
- **Date:** 2026-11-14

ADR numbers without four digits (ADR-001, ADR-002, ADR-008, ADR-012) refer to
`docs/internal/audits/saas-readiness/decisions.md`, not the global registry. "The last run" is
`audit-2026-10-20.md` and its kit, `saas-reaudit-2026-10-20`.

## Context and goals

The last run (#197, `b3054cb`) kept GOLD WITH CAVEATS. Every caveat was confirmed closed, and a
clean GOLD was held back by two P1 findings in the queue worker, X60 and X62. It opened six P2
findings: X1, X20, X40, X41, X61 and X63. All eight are recorded as fixed in #198 to #203, and no
dated run has seen a fix. `FINAL-AUDIT-SUMMARY.md` § 8 item 13 says the next dated run can restate
GOLD.

This run confirms or refutes those fixes, grades the rest of the window fresh, and decides the
verdict under a rule written before any evidence ([D-01](decisions.md)).

- **Window:** `b3054cb..6a0eb2a`, 51 commits (#198 to #298), 531 files, 152 of them under `src/`.
  It holds ADR-0077 to ADR-0096 and the move of open work to GitHub Issues (ADR-0085).
- **Evidence commit:** `6a0eb2a`, `origin/dev` when the branch was cut.
- **Independence:** the session running this audit wrote none of the window.

## Acceptance criteria

- **AC-1** — `audit-2026-11-14.md` exists in the shape of the last run; `git diff` on every other
  `audit-*.md`, the frozen register and `docs/internal/todos/` is empty.
  _Why:_ ADR-002; ADR-0085 makes the register and the todos records.
- **AC-2** — The header states the window, the evidence commit, the graders and their lanes, the
  runtime, and that this session wrote none of the window.
  _Why:_ the last run could not claim independence, and said so.
- **AC-3** — D-01 is in the kit before the first gate or grader, and the audit cites it.
  _Why:_ a rule written after the result bends to it.
- **AC-4** — C1 to C6, S1 and S2 each carry a grade from a grader (C1 from the fork run) with
  evidence at `path:line` on the evidence commit, and a reproduction.
  _Why:_ ADR-008, ADR-012.
- **AC-5** — X60 and X62 each carry the queue grader's grade and the main thread's reproduction on
  a throwaway broker and database, with the numbers observed.
  _Why:_ D-01 item 3.
- **AC-6** — X1, X20, X40, X41, X61 and X63 each carry a grade and a reproduction.
  _Why:_ the register marks each "a run is owed".
- **AC-7** — Every register row marked "Not yet", "Partly … a dated run must confirm", "Not
  confirmed" or "Not graded", and every issue closed in the window (#239 to #297), has a grade or
  is listed as not graded with the reason.
  _Why:_ the last run left B-50, B-52 and B-69 unassigned.
- **AC-8** — Every gate was run on Node 24.22.1 after a clean `npm ci`, with its real exit code and
  the versions recorded; a skipped gate is reported as skipped.
  _Why:_ ADR-001 criterion 2.
- **AC-9** — All 65 items are regraded, each change traced to a grader's grade; ADR-001 is
  evaluated criterion by criterion; the verdict follows from D-01 and from nothing else.
  _Why:_ the scorecard is the root checklist's content.
- **AC-10** — `FINAL-AUDIT-SUMMARY.md` (status paragraph, § 4 note, § 6 lineage row, § 8 item 14,
  § 9), the audit folder's `README.md`, `SAAS-BASE-CHECKLIST.md` and the `CLAUDE.md` audit
  paragraph point at the new run; every new finding, P0 to P3, has an issue with its labels, and
  one a later run must confirm says so.
  _Why:_ ADR-002; `.claude/rules/workflow.md` § What's next.

## Open questions

None.

## Out of scope

Fixing any finding. The frontend. Load testing beyond X20 and X62. Editing a prior audit file, the
frozen register or a dated todo. Any `.github/` edit. Billing, a gap kept on purpose since #297.

## Decisions expected

- D-01: the verdict rule. D-02: the method. D-03: where a confirmation is recorded now that the
  register is frozen. All three are written before any evidence.
- D-04 onward, each written when it is taken: any P1 that arrives, any caveat grade that is not
  mechanical, each scorecard item that moves.

## Phases

### Phase 0 — issue, branch, kit

Issue #299, the branch, and this kit with D-01 to D-03.

### Phase 1 — evidence

A clean `npm ci` on Node 24.22.1 and the gates, each with its exit code. Four graders, started
after the install, each told what a finding claimed and never what its fix does (D-02). The main
thread's reproductions on throwaway services. The fork run on four clones. The Appendix B scans.

### Phase 2 — the record

The dated audit, then the live documents that point at it, then an issue body for each new
finding, which the owner files.

## Risks and trade-offs

- A grader keeps X60 or X62 open on a ground the main thread cannot refute. The run then ends
  without GOLD. That is the rule working, not a failure of the run.
- A known flake recurs in the test gate. D-01 item 8 says how it is judged.
- `npm ci` replaces `node_modules` in this checkout, as the last run did.
- The graders are subagents of this session, on its model. Their independence is of context: none
  is told what a fix does. The window was written by other sessions.
- Many P3 findings. Their reproductions are the first thing cut past the appetite; each is then
  marked _(agent, not run)_.

## Rollback

Not applicable: the branch changes Markdown only.

## Security and data

Every reproduction runs on throwaway containers and a scratch `.env`. The owner's `.env` files are
never read, and the owner's Compose stack is never written to. No personal detail leaves the
machine: the Sentry capture is a local listener.

## References

- [`audit-2026-10-20.md`](../../audits/saas-readiness/audit-2026-10-20.md) and its kit,
  [`saas-reaudit-2026-10-20`](../saas-reaudit-2026-10-20/README.md)
- [`decisions.md`](../../audits/saas-readiness/decisions.md) of the audit folder: ADR-001, ADR-002,
  ADR-008, ADR-012
- [`FINAL-AUDIT-SUMMARY.md`](../../audits/saas-readiness/FINAL-AUDIT-SUMMARY.md) § 8
- [The frozen debt register](../backend-debt-register/register.md), Closed table
- [ADR-0085](../../../explanation/decisions/adr-0085-every-task-starts-from-an-issue.md)
