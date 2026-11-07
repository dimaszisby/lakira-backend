# SaaS re-audit, 2026-10-05 — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Checked against `origin/dev` at
`deb736d` (#137).

## Phase 0 — kit and branch

- [x] `docs/saas-reaudit-2026-10-05` cut with `--no-track` from `origin/dev` at `deb736d`; HEAD and
      upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01 (method) and D-02 (verdict rule),
      written before any evidence

## Phase 1 — evidence

- [x] Gates run on Node 24.21.0 after `npm ci`, each exit code recorded (audit § 2)
- [x] Delta pass by the three agents: C3 to C6, S1 to S15, the R findings still open, ADR-0058,
      stale `Proposed` records, each labelled (audit § 4). C1 is graded by the fork run. C2 was put
      to no agent and keeps its grade (D-04). The open 2026-06-05 rows, R8 and R9 were not re-read
      and are marked _(inferred)_
- [x] Fresh pass over the 25 changed `src/` files, the five scripts and `fork-smoke.yml` (audit § 6)
- [x] Fork dry-run executed through the full `npm test` and `docs:openapi:check`; S3 and S4 on a
      second clone, T3 on a third; throwaway containers removed afterwards (audit § 5)
- [x] Live reproductions of S1 and S8 against the fork's server on the throwaway services; S7 by
      its integration test, which also ran on the fork's database. No separate direct query was
      run for S7: the test already forces the tie
- [x] Appendix B scans (audit § 6)
- [x] Every agent grade for a fix verified by the main thread at the cited lines or by
      reproduction; unverified items marked _(agent)_

## Phase 2 — the audit record

- [x] `docs/internal/audits/saas-readiness/audit-2026-10-05.md`, same sections as the previous run
- [x] `SAAS-BASE-CHECKLIST.md`: audit date and link, verdict, criteria, scorecard, gates, top gaps
- [x] `FINAL-AUDIT-SUMMARY.md`: status paragraph, "as of", § 4 caveat rows and notes, § 6 lineage
      row, § 8 next actions, § 9 links
- [x] `docs/internal/audits/saas-readiness/README.md` lists the new run
- [x] `CLAUDE.md` live-risk line and `docs/tutorials/fork-and-rebrand.md` restated from this run's
      result
- [x] Todos: five confirmed fixes marked confirmed with the run's date; T1 and T2 each have a todo
      dated 2026-10-05; S10 has the todo file it lacked; new P3s stay in the audit's § 6

## Discovered

- [x] Found: a database error is logged with its statement's bound values (T1, P2), raised by the
      security agent and reproduced through requests → reopens C6 (D-03); out of scope to fix, the
      existing `docs/internal/todos/2026-10-05-todo-error-log-may-carry-personal-data.md` rewritten
      from "unverified" to confirmed
- [x] Found: a fork's spec keeps the upstream title and cookie name, and its gate depends on
      `APP_NAME` not being exported (T2, P2), raised by the code-review agent and reproduced →
      filed as `docs/internal/todos/2026-10-05-todo-fork-spec-describes-upstream.md` (D-04)
- [x] Found: bootstrap double-renames on a second run when the name contains "lakira" (T3, P3),
      reproduced → stays in the audit's § 6
- [x] Found: the first fork run failed its migrations because the port change missed the database
      URLs in `.env`, which still pointed at the owner's Postgres on 5432. It refused the fork's
      user, so nothing was written there → the URLs were changed and the steps rerun; recorded in
      the audit's § 5
- [x] Found: the scratch directory is not shared with Docker, so the fork's init SQL was applied
      by hand, as in the last run
- [x] Found: the security agent has no shell and the other two were told not to run npm, so every
      "needs a run" item came back to the main thread; all were run
- [x] Left behind: three scratch clones and the Node 24 tarball in the session scratchpad (a hook
      refuses `rm -rf`). The throwaway containers were removed. Nothing was written to the owner's
      development or test database beyond what the repo's own gates write to `lakira_test_db`

## Acceptance

- [x] **AC-1** — A new dated audit file exists and no earlier one is modified: `git diff` on
      `audit-2026-0[569]*.md` and `audit-2026-10-03.md` is empty. _Why:_ ADR-002.
- [x] **AC-2** — Each of C1 to C6 is confirmed or reopened with evidence from `dev` at `deb736d`:
      five confirmed, C6 reopened. _Why:_ ADR-008.
- [x] **AC-3** — Each of S1 to S15 carries a status with evidence; S1 and S2 are each reproduced
      against running code, not read. _Why:_ they are the two P1s the last run said block GOLD.
- [x] **AC-4** — All ADR-001 gates run on Node 24.21.0 after `npm ci`, with real exit codes.
      _Why:_ criterion 2.
- [x] **AC-5** — All 65 items re-graded (50 / 11 / 4), and ADR-001 evaluated criterion by
      criterion: passes. _Why:_ the scorecard is the root checklist's content.
- [x] **AC-6** — The fork dry-run was executed through `npm test` and `docs:openapi:check`, not
      inferred. _Why:_ C1 and S2 are fork-flow claims.
- [x] **AC-7** — No fix was graded by the session that wrote it: every fix's grade comes from an
      agent, and the audit's header says which agent graded what and what the main thread verified.
      _Why:_ a self-graded GOLD is the failure the independent run of 2026-05-24 exists to prevent.
- [x] **AC-8** — The verdict follows from the evidence under the rule fixed in D-02: C6 is open, so
      no GOLD restatement (D-03). _Why:_ the rule is written before the result so it cannot bend
      to it.
- [x] **AC-9** — Root checklist, summary, `CLAUDE.md` and the tutorial point at the new run; both
      new P2 findings are tracked in a todo, and there is no new P1. _Why:_ ADR-002.

## Gates

Run on Node 24.21.0 at `deb736d` after `npm ci`; the branch changes Markdown only.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0, re-run after the docs were written
- [x] tests — exit 0 on the first run: unit 764 passed; integration 220 passed, 5 skipped. Unit
      re-run after the docs were written
- [x] build — exit 0
- [x] OpenAPI — `docs:openapi:check` exit 0, no drift
- [x] security delta — `check` exit 0 (3 medium); `gate` `passed=true blocking=0`
- [x] image smoke — `docker:smoke` exit 0, six checks
- [x] extra: `contract:local:gate` exit 0 (1442 generated, the 2 known warnings);
      `test:unit:security-framework` exit 0
