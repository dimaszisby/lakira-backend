# SaaS re-audit, dated run of 2026-10-10 — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Checked against `origin/dev` at
`41da6a6` (#149).

## Phase 0 — kit and branch

- [x] `docs/saas-reaudit-2026-10-10` cut with `--no-track` from `origin/dev` at `41da6a6`; HEAD
      and upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01 (method) and D-02 (verdict rule),
      written before any evidence

## Phase 1 — evidence

- [x] `npm ci`, then the gates on Node 24.21.0, each exit code recorded (audit § 2)
- [x] The three agents' grades, started after the install: C2 to C6, U1, U2, the cache-key route,
      T3, T6 to T8, S9, S10, S13, S15, R7, R11, ADR-0059, ADR-0060 and the registry (audit § 4).
      T4, T5, U3, U4 and the older rows nothing touched were not re-read and are marked
      _(inferred)_
- [x] Fresh pass over the changed `src/` files and scripts, the analytics fixes included
      (audit § 6)
- [x] Fork dry-run: bootstrap's output read on an untouched clone, then the printed steps through
      `npm test` and `docs:openapi:check` on a second; the fork's production image started with no
      `APP_NAME`; throwaway containers and the image removed afterwards (audit § 5)
- [x] Live reproductions: S1, the registration race, eight shapes of U1, a metric search for an
      email address with the cache on, four rejected-request shapes, and the routes the agents
      named for C6, C5, C4 and C3
- [x] Appendix B scans (audit § 6)
- [x] Every agent grade on a caveat verified by the main thread by reproduction; other items the
      main thread did not check are marked _(agent)_

## Phase 2 — the audit record

- [x] `docs/internal/audits/saas-readiness/audit-2026-10-10.md`, same sections as the last run
- [x] `SAAS-BASE-CHECKLIST.md`: audit date and link, verdict, criteria, scorecard, gates, top gaps
- [x] `FINAL-AUDIT-SUMMARY.md`: status paragraph, "as of", § 4 caveat rows and notes, § 6 lineage
      row, § 8 next actions, § 9 links
- [x] `docs/internal/audits/saas-readiness/README.md` lists the new run
- [x] `CLAUDE.md` live-risk line and `docs/tutorials/fork-and-rebrand.md` restated from this run's
      result
- [x] Todos: V2 and V3 each filed; the V1 todo marked reproduced. V4 and V5 are P3 and have no
      todo; they are in the audit's § 6 and § 9
- [x] Loose ends from #149: `deterministic-query-ordering` D-07 to Accepted; the deleted-metric
      todo names #149

## Discovered

- [x] Found: C5 and C3, carried as closed for three runs, were graded open-progressed, and C4 with
      them → recorded as graded, each reproduced (D-03). The caveat list grew from two to four
      with no regression in the code
- [x] Found: `DB_LOGGING=true` with `LOG_LEVEL=debug` writes SQL with its values (V2, P2) → filed
      as `docs/internal/todos/2026-10-10-todo-db-logging-writes-sql-values.md`
- [x] Found: T7 had no todo → filed as V3,
      `docs/internal/todos/2026-10-10-todo-sentry-scrubber-leaves-url-user-breadcrumbs.md`
- [x] Found: ADR-0059 and ADR-0060 each hold sentences the code does not bear out (audit § 4.4),
      and ADR-0022 reads as stale `Proposed` → out of scope to edit here; named in the audit's
      § 9 item 7
- [x] Found: a first try at the registration race used a wrong payload and spent the fork's
      registration limit → the fork's server was restarted with `DISABLE_RATE_LIMITING=true`, and
      the reproductions that follow ran that way
- [x] Not done: T3 (`--name lakira-x`) and the refused names were not rerun; the agent read the
      unchanged lines. `process.env` and `sequelize` scans were rerun; the branding scan was read
      on the fork
- [x] Left behind: two scratch clones and an empty directory in the session scratchpad (a hook
      refuses `rm -rf`). The throwaway containers and the fork's image were removed. Nothing was
      written to the owner's development database, and the running local stack was not touched

## Acceptance

- [x] **AC-1** — A new dated file exists and no earlier audit file is modified: `git diff` on every
      other `audit-*.md` is empty. _Why:_ ADR-002.
- [x] **AC-2** — Each of C1 to C6 carries a grade from an agent or, for C1, from the fork run, with
      evidence at `41da6a6`. _Why:_ ADR-008.
- [x] **AC-3** — S1, S2, C6 and C2 are each reproduced against running code: S1, S2 and C2 closed;
      for C6, the named routes closed and V1 and V2 open. _Why:_ D-02; C2's fix is graded for the
      first time.
- [x] **AC-4** — All ADR-001 gates run on Node 24.21.0 after `npm ci`, with real exit codes.
      _Why:_ criterion 2.
- [x] **AC-5** — All 65 items re-graded (50 / 11 / 4, unchanged), and ADR-001 evaluated criterion
      by criterion: passes. An item with no new evidence kept its grade (D-04). _Why:_ the
      scorecard is the root checklist's content.
- [x] **AC-6** — The fork dry-run was executed through `npm test` and `docs:openapi:check`,
      bootstrap's output was read on a clone nothing else touched, and the fork's production image
      was started with no `APP_NAME`: `service` is `acme-api`. _Why:_ C1, C2 and S2 are fork-flow
      claims; the last run showed U2 on a built module only.
- [x] **AC-7** — No fix was graded by the session that wrote it, and no agent's caveat grade was
      overturned: all four open grades were reproduced and stand. _Why:_ a self-graded GOLD is the
      failure the independent run of 2026-05-24 exists to prevent.
- [x] **AC-8** — The verdict follows from the evidence under the rule fixed in D-02: four of the
      eight conditions are open, so no GOLD restatement (D-03). _Why:_ the rule is written before
      the result so it cannot bend to it.
- [x] **AC-9** — Root checklist, summary, `CLAUDE.md` and the tutorial point at the new run; each
      of the three P2 findings has a todo. _Why:_ ADR-002.

## Gates

Run on Node 24.21.0 at `41da6a6` after `npm ci`; the branch changes Markdown only.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0, re-run after the docs were written
- [x] tests — exit 0 on the first run: unit 885 passed; integration 226 passed, 5 skipped. Unit
      re-run after the docs were written
- [x] build — exit 0
- [x] OpenAPI — `docs:openapi:check` exit 0, no drift
- [x] security delta — `check` exit 0 (3 medium); `gate` `passed=true blocking=0`
- [x] image smoke — `docker:smoke` exit 0, seven checks
- [x] extra: `contract:local:gate` exit 0 (1442 generated, the 2 known warnings);
      `test:unit:security-framework` exit 0; CI on `41da6a6` green in all four workflows
