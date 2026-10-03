# SaaS re-audit, 2026-10-03 — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Checked against `origin/dev` at
`582c1b5` (#131).

## Phase 0 — kit and branch

- [x] `docs/saas-reaudit-2026-10-03` cut with `--no-track` from `origin/dev` at `582c1b5`; HEAD and
      upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01 (method) and D-02 (verdict rule)
- [x] Loose ends from #131: `error-envelope-residuals/README.md`, the C3 todo and
      `FINAL-AUDIT-SUMMARY.md` § 8 say merged in #131 (`582c1b5`) where they name the branch

## Phase 1 — evidence

- [x] Gates run on Node 24.21.0 after `npm ci`, each exit code recorded (audit § 2)
- [x] Delta pass: C1 to C6, R1 to R13, the open 2026-06-05 rows, ADR-0051 to ADR-0057, stale
      `Proposed` records, each labelled (audit § 4)
- [x] Fresh pass over the 43 changed `src/` files, the two new workflows and
      `scripts/image-smoke.sh` (audit § 6)
- [x] Fork dry-run executed through the full `npm test`; throwaway containers removed afterwards
      (audit § 5)
- [x] Appendix B scans (audit § 6)
- [x] Every caveat status, every P0 or P1 and every grade change reproduced or read at the cited
      lines; unverified agent items marked _(agent)_

## Phase 2 — the audit record

- [x] `docs/internal/audits/saas-readiness/audit-2026-10-03.md`, same sections as the previous run
- [x] `SAAS-BASE-CHECKLIST.md`: audit date and link, verdict, criteria, scorecard, gates, top gaps
- [x] `FINAL-AUDIT-SUMMARY.md`: status paragraph, "as of", § 4 caveat rows and notes, § 6 lineage
      row, § 8 next actions, § 9 links
- [x] `docs/internal/audits/saas-readiness/README.md` lists the new run
- [x] `CLAUDE.md` live-risk line and `docs/tutorials/fork-and-rebrand.md` restated from this run's
      result (S11)
- [x] Todos: each confirmed fix marked confirmed with the run's date; each new P1 or P2 finding
      filed as `docs/internal/todos/2026-10-03-todo-<slug>.md` (six files); new P3s stay in the audit's
      § 6

## Discovered

- [x] Found: the response cache replays error bodies with status 200 (S1, P1), reproduced against a
      live server → out of scope to fix, filed as
      `docs/internal/todos/2026-10-03-todo-cache-replays-error-responses.md`
- [x] Found: a fork's `docs:openapi:check` exits 128 (S2, P1), with bootstrap ordering (S3, S4) and
      unrotated service passwords (S10), all reproduced on scratch clones → filed as
      `docs/internal/todos/2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md`
- [x] Found: C4 stays open through `src/types/` and application-to-infrastructure imports (S5, S6)
      → filed as `docs/internal/todos/2026-10-03-todo-boundary-rule-types-and-application-infra.md`
- [x] Found: S7, S8, S9 (P2) → filed as `2026-10-03-todo-dashboard-latest-value-tiebreaker.md`,
      `…-limiter-logs-email-address.md`, `…-readiness-probe-unthrottled.md`
- [x] Found: `CLAUDE.md` and the fork tutorial claimed all of C1–C6 closed (S11) → in scope, both
      corrected in Phase 2, because pointing at the audit status is this kit's job
- [x] Found: the `security-reviewer` agent has no shell, so it could not read diffs and worked from
      the tree at HEAD → recorded in the audit's header; no change to the method
- [x] Found: the repo's Bash hook refuses `rm -rf`, so the two scratch clones under the session
      scratchpad were left in place; the throwaway containers were removed
- [x] Left behind: one user `audit<timestamp>@example.com` in the local development database, from
      reproducing S1

## Acceptance

- [x] **AC-1** — A new dated audit file exists and no prior audit file is modified: `git diff` on
      `audit-2026-0[569]*.md` is empty. _Why:_ ADR-002.
- [x] **AC-2** — Each of C1 to C6 is confirmed or reopened with evidence from `dev` at `582c1b5`.
      _Why:_ ADR-008.
- [x] **AC-3** — Each of R1 to R13 carries a status with evidence. _Why:_ seven are recorded as
      "pending a dated run".
- [x] **AC-4** — All ADR-001 gates run on Node 24.21.0 with real exit codes. _Why:_ criterion 2.
- [x] **AC-5** — All 65 items re-graded (49 / 12 / 4), and ADR-001 evaluated criterion by criterion:
      passes. _Why:_ the
      scorecard is the root checklist's content.
- [x] **AC-6** — The fork dry-run was executed through `npm test`, not inferred. _Why:_ C1 is a
      fork-flow claim, and the last run stopped at a credentials failure before the tests ran.
- [x] **AC-7** — The verdict follows from the evidence under the rule fixed in D-02: C4 open and two
      P1 findings (D-05), so no GOLD restatement. _Why:_ the
      rule is written before the result so it cannot bend to it.
- [x] **AC-8** — Root checklist, summary and `CLAUDE.md` point at the new run; every new P1 and P2
      is tracked in a todo. _Why:_ ADR-002, and the `CLAUDE.md` line is currently wrong.

## Gates

Run on Node 24.21.0 at `582c1b5` after `npm ci`; the branch changes Markdown only.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0, re-run after the docs were written
- [x] tests — exit 0 on the first run: unit 705 passed; integration 219 passed, 5 skipped
- [x] build — exit 0
- [x] OpenAPI — `docs:openapi:check` exit 0, no drift
- [x] security delta — `check` exit 0 (3 medium); `gate` `passed=true blocking=0`
- [x] image smoke — `docker:smoke` exit 0, six checks
- [x] extra: `contract:local:gate` exit 0 (1443 generated, the 2 known warnings);
      `test:unit:security-framework` exit 0
