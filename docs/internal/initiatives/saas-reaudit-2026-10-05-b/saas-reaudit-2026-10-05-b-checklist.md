# SaaS re-audit, second run of 2026-10-05 — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Checked against `origin/dev` at
`747d4b3` (#140).

## Phase 0 — kit and branch

- [x] `docs/saas-reaudit-2026-10-05-b` cut with `--no-track` from `origin/dev` at `747d4b3`; HEAD
      and upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01 (method), D-02 (verdict rule) and D-03
      (filename), written before any evidence

## Phase 1 — evidence

- [x] Gates run on Node 24.21.0 after `npm ci`, each exit code recorded (audit § 2)
- [x] The three agents' grades: C2 to C6, T1 to T3, T6 to T8, S9, S10, S13, S15, R7, R11, ADR-0059
      and the registry (audit § 4). T4, T5 and the older rows nothing touched were not re-read and
      are marked _(inferred)_
- [x] Fresh pass over the two changed `src/` files, the four scripts and `fork-smoke.yml`
      (audit § 6)
- [x] Fork dry-run: bootstrap's output read on an untouched clone, then the printed steps through
      `npm test` and `docs:openapi:check`; throwaway containers removed afterwards (audit § 5)
- [x] Live reproductions: S1, S2, T1 (the registration race and a `%j` body), T2 (spec, gate,
      cookie, served spec), S8, T3, and the routes the agents named for C6 and C2
- [x] Appendix B scans (audit § 6)
- [x] Every agent grade verified by the main thread at the cited lines or by reproduction;
      unverified items marked _(agent)_

## Phase 2 — the audit record

- [x] `docs/internal/audits/saas-readiness/audit-2026-10-05-b.md`, same sections as the first run,
      with the correction of that run's "stale link" claim in § 5
- [x] `SAAS-BASE-CHECKLIST.md`: audit date and link, verdict, criteria, scorecard, gates, top gaps
- [x] `FINAL-AUDIT-SUMMARY.md`: status paragraph, "as of", § 4 caveat rows and notes, § 6 lineage
      row, § 8 next actions, § 9 links
- [x] `docs/internal/audits/saas-readiness/README.md` lists the new run
- [x] `CLAUDE.md` live-risk line and `docs/tutorials/fork-and-rebrand.md` restated from this run's
      result
- [x] Todos: the T1 and T2 todos marked confirmed; U1 and U2 each filed, dated 2026-10-06, the day
      they were written

## Discovered

- [x] Found: an error nested in log metadata is written with its payload through a `%j` or `%o`
      token, in an array, or at depth 5 (U1, P3), raised by the security agent and reproduced →
      keeps C6 open (D-04); filed as
      `docs/internal/todos/2026-10-06-todo-nested-error-payload-in-logs.md`
- [x] Found: a fork deployed without `APP_NAME` is branded as the template (U2, P2), raised by the
      code-review agent and reproduced → C2 graded open; the owner's 2026-09-24 decision accepted
      this case, so it is filed for the owner as
      `docs/internal/todos/2026-10-06-todo-fork-deployed-without-app-name.md` (D-05)
- [x] Found: T3 is wider than recorded; a name containing "lakira" also double-expands the
      workflow titles on the first run → stays P3, in the audit's § 4.2
- [x] Found: ADR-0059 says nothing after its format holds an error object, which U1 shows is not
      true → out of scope to edit here; named in the U1 todo to be corrected with the fix
- [x] Found: the security agent started while `npm ci` was replacing `node_modules` and could not
      read the logging library → its statements about it were run before being recorded; the next
      run should start the agents after the install (D-06)
- [x] Found: the run crossed midnight. The gates, the grades and the fork's printed steps are of
      2026-10-05, the reproductions and the record of 2026-10-06 → the file keeps the name fixed in
      D-03 and its header gives both dates
- [x] Left behind: three scratch clones in the session scratchpad (a hook refuses `rm -rf`). The
      throwaway containers were removed. Nothing was written to the owner's development database

## Acceptance

- [x] **AC-1** — A new dated file exists and no earlier audit file is modified: `git diff` on every
      other `audit-*.md` is empty. _Why:_ ADR-002.
- [x] **AC-2** — Each of C1 to C6 carries a grade from an agent or, for C1, from the fork run, with
      evidence at `747d4b3`. _Why:_ ADR-008, and C2 was graded by no one in the first run.
- [x] **AC-3** — S1, S2 and C6 are each reproduced against running code: S1 and S2 closed; for C6,
      T1 closed and U1 open. _Why:_ D-02.
- [x] **AC-4** — All ADR-001 gates run on Node 24.21.0 after `npm ci`, with real exit codes.
      _Why:_ criterion 2.
- [x] **AC-5** — All 65 items re-graded (50 / 11 / 4, unchanged), and ADR-001 evaluated criterion
      by criterion: passes. _Why:_ the scorecard is the root checklist's content.
- [x] **AC-6** — The fork dry-run was executed through `npm test` and `docs:openapi:check`, and
      bootstrap's output was read before anything on that clone was changed. _Why:_ C1, C2 and S2
      are fork-flow claims, and the first run's error.
- [x] **AC-7** — No fix was graded by the session that wrote it, and no agent's caveat grade was
      overturned: both open grades were reproduced and stand. _Why:_ a self-graded GOLD is the
      failure the independent run of 2026-05-24 exists to prevent.
- [x] **AC-8** — The verdict follows from the evidence under the rule fixed in D-02: C6 and C2 are
      open, so no GOLD restatement (D-04, D-05). _Why:_ the rule is written before the result so
      it cannot bend to it.
- [x] **AC-9** — Root checklist, summary, `CLAUDE.md` and the tutorial point at the new run; the
      one new P2 has a todo, as does U1; the first run's false claim is corrected in the audit's
      § 5. _Why:_ ADR-002.

## Gates

Run on Node 24.21.0 at `747d4b3` after `npm ci`; the branch changes Markdown only.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0, re-run after the docs were written
- [x] tests — exit 0 on the first run: unit 805 passed; integration 220 passed, 5 skipped. Unit
      re-run after the docs were written
- [x] build — exit 0
- [x] OpenAPI — `docs:openapi:check` exit 0, no drift
- [x] security delta — `check` exit 0 (3 medium); `gate` `passed=true blocking=0`
- [x] image smoke — `docker:smoke` exit 0, six checks
- [x] extra: `contract:local:gate` exit 0 (1441 generated, the 2 known warnings);
      `test:unit:security-framework` exit 0; CI on `747d4b3` green in all four workflows
