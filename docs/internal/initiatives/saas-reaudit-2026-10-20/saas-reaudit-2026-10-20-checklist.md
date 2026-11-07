# SaaS re-audit, dated run of 2026-10-20 — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Checked against `origin/dev` at
`4a0b21c` (#196).

## Phase 0 — kit and branch

- [x] `docs/saas-reaudit-2026-10-20` cut with `--no-track` from `origin/dev` at `4a0b21c`; HEAD
      and upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01 (method) and D-02 (verdict rule),
      written before any evidence

## Phase 1 — evidence

- [x] `npm ci` on Node 24.22.0, then the gates, each exit code recorded (audit § 2)
- [x] The four graders' grades, started after the install (audit § 4)
- [x] Reproductions against built or running code:
  - C5 with W1, on six span envelopes and an error event captured from the built server
  - V1 (six starts), V2, V4 (four spellings), V5 (the validator on a copy), S1
  - B-07, B-12, B-21, B-18 (thirteen startup cases); B-14, B-06, B-19, B-23, B-68
  - B-45, B-46, B-43, B-44, B-72
  - R8, B-39, B-40, B-70 on a throwaway broker and Mailpit
  - the graders' new grounds X60, X62, X1, X20, X40, X41, X61 and X63
- [x] Fork dry-run on four clones: bootstrap's output read on an untouched one (A), W3 (C), T3 (D),
      and the printed steps through `npm test`, `docs:openapi:check` and the fork's `docker:smoke`
      (B) (audit § 5)
- [x] Appendix B scans (audit § 6)
- [x] Every grader's grade on a caveat verified by reproduction; items the main thread did not
      check are marked _(agent)_; D-03 (written when the first P1 arrived), D-04 and D-05 for the
      grading calls that are not mechanical

## Phase 2 — the audit record

- [x] `docs/internal/audits/saas-readiness/audit-2026-10-20.md`, the last run's sections
- [x] `SAAS-BASE-CHECKLIST.md`: audit date and link, verdict, criteria, scorecard, gates, top gaps
- [x] `FINAL-AUDIT-SUMMARY.md`: status paragraph, § 4 note, § 6 lineage row, § 8 item 13, § 9
      links; the audit folder's `README.md` lists the run
- [x] `CLAUDE.md` live-risk line and `docs/tutorials/fork-and-rebrand.md` § 5
- [x] Register: "Confirmed by an audit" for every graded Closed row (35 rows yes, 6 partly, 5 not
      graded, a row split in two counted twice); the Tier 1 note; B-74 to B-84 placed by D-01 as amended by the register's D-05;
      B-62 and B-73 cite their new grounds; "As of" `4a0b21c`. A todo for each P1 and P2 (seven)
- [x] Todos the run settles: W1's and V3's closed, W2's confirmed, the bootstrap leftovers' W3 and
      T3 items confirmed
- [x] Loose ends from #196: ADR-0076 Accepted (file and row); the
      `floating-promises-and-bounded-shutdown` README and plan Done; B-37 and B-38 and their two
      todos name `#196 (4a0b21c)`
- [x] Notion: no record. No finding needs the frontend to decide or act yet; X61's fix will
      change a 401 into a 5xx, and its record belongs with that fix

## Discovered

- [x] Found: this machine has only Node 26 → in scope: the official Node 24.22.0, checked against
      nodejs.org's SHA-256 list, run from the scratchpad (D-01)
- [x] Found: npm 11.19 skips install scripts by default, four of them here → in scope: each module
      was loaded and exercised before the gates; all four use prebuilt binaries (audit § 2)
- [x] Found: two P1 findings from the queue grader → D-03 written on arrival, both reproduced
      (D-04)
- [x] Found: D-01 of the register has no tier for a P1 that is not owed to the frontend → the
      register's D-05: a P1 that blocks a clean GOLD ranks in tier 1
- [x] Found: the main thread's prompt put T8's claim beside T7's id → the grader graded T7 from that
      run's own row; recorded in D-04, no grade rests on it
- [x] Found: two graders reported slips (one read-only `git ls-files`; searches that surfaced status
      text) → recorded in the audit header; both graded from code
- [x] Found: the RabbitMQ management API's queue statistics lag by up to 5 s, which made the first
      X60 reading ambiguous → rerun with `rabbitmqctl list_consumers`, which reads live; only the
      rerun is cited
- [x] Found: the first P1 run's queue purge ran before the jobs were published, so it mixed jobs →
      both P1 grounds rerun on emptied queues; only the reruns are cited
- [x] Found: early reproduction scripts sent register without `passwordConfirmation`, used the
      wrong token field and the wrong list parameter → fixed and rerun; only the reruns are cited
- [x] Found: findings outside every caveat's list, P2 and P3 → filed: B-76 to B-84, and seven todos
- [x] Not done: B-50 and B-52 were not mapped to a grader, and B-69 was assigned to none; events were captured by a local
      listener, not received by Sentry; the fork ran on throwaway containers, not its own Compose
      file, which `Fork Smoke` covers on `4a0b21c`; the P3 findings were not run
- [x] Touched on the owner's stack: nothing. Every reproduction used throwaway containers
      (`audit-pg`, `audit-redis`, `audit-rmq`, `audit-mail`) and a scratch `.env`
- [x] Left behind: the scratch clones and scripts in the session scratchpad; the throwaway
      containers are removed after the gates on this branch

## Acceptance

- [x] **AC-1** — `audit-2026-10-20.md` exists; `git diff` on every other `audit-*.md` is empty.
      _Why:_ ADR-002.
- [x] **AC-2** — C1 to C6 each carry a grade from a grader or, for C1, the fork run, with evidence
      at `4a0b21c` (audit § 4.1). _Why:_ ADR-008.
- [x] **AC-3** — C5 graded by its grader on V3 with W1 (closed-confirmed), and reproduced on the
      built server. _Why:_ ADR-012.
- [x] **AC-4** — Every closed register row of the window has a grade, except B-69, which the
      main thread assigned to no grader: it is recorded as not graded, with the gate that exercises
      it (audit § 4.4; the register's last column). _Why:_ the register's last column.
- [x] **AC-5** — No row stays "not re-read": U3, U4, T4 to T8, S12 to S15, R4, R8 to R13 and the
      2026-06-05 rows are each graded (audit § 4.3). _Why:_ the owner's full re-read; B-61.
- [x] **AC-6** — Every gate run on Node 24.22.0 after `npm ci`, with real exit codes (audit § 2).
      _Why:_ ADR-001 criterion 2.
- [x] **AC-7** — All 65 items re-graded (53 / 8 / 4), and ADR-001 evaluated criterion by
      criterion: passes (D-05). _Why:_ the scorecard is the root checklist's content.
- [x] **AC-8** — No fix was graded by the session that wrote it, and no grader's grade was
      overturned: every caveat grade and both P1 grounds were reproduced and stand. _Why:_ a
      self-graded GOLD is the failure the independent run of 2026-05-24 exists to prevent.
- [x] **AC-9** — The verdict follows from D-02 and D-03: all eight conditions closed, two P1
      findings unrefuted, so no GOLD restatement (D-04). _Why:_ the rule is written before the
      result so it cannot bend to it.
- [x] **AC-10** — The root checklist, the summary, `CLAUDE.md` and the tutorial point at the new
      run; each new P1 and P2 has a todo and a register row, each P3 a row. _Why:_ ADR-002;
      `.claude/rules/workflow.md` § What's next.

## Gates

Run on Node 24.22.0 at `4a0b21c` after `npm ci` (the evidence, audit § 2), then on the branch,
which changes Markdown only.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0
- [x] tests — exit 0 on the first run: unit 1437 passed; integration 283 passed, 5 skipped;
      `test:coverage` exit 0 with thresholds met
- [x] build — exit 0
- [x] OpenAPI — `docs:openapi:check` exit 0, no drift
- [x] security delta — `check` exit 0 (3 medium); `gate` `passed=true blocking=0`
- [x] image smoke — `docker:smoke` exit 0, seven checks
- [x] extra: `contract:local:gate` exit 0 (1446 generated, the 2 known warnings);
      `test:unit:security-framework` exit 0; CI on `4a0b21c` green in all four workflows
- [x] branch gates after the docs, on Node 24.22.0: typecheck, lint, format, unit tests (1437
      passed), build, `docs:openapi:check` and `test:unit:security-framework`, each exit 0.
      Integration tests skipped on the branch: it changes Markdown only
