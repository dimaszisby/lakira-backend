# SaaS re-audit, dated run of 2026-10-12 — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Checked against `origin/dev` at
`5bb4e3a` (#157).

## Phase 0 — kit and branch

- [x] `docs/saas-reaudit-2026-10-12` cut with `--no-track` from `origin/dev` at `5bb4e3a`; HEAD
      and upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01 (method) and D-02 (verdict rule),
      written before any evidence

## Phase 1 — evidence

- [x] `npm ci`, then the gates on Node 24.21.0, each exit code recorded (audit § 2)
- [x] The three agents' grades, started after the install: C2 to C6 with V1 to V5, S2 to S4, S9,
      S10, T3, the import-form rule, ADR-0059 and the registry, and the three fixes never graded
      before (audit § 4)
- [x] Reproductions against built or running code: V1 (six starts with a rejected URL), V2
      (production and development), V3 (a transaction captured on a local listener), V4 and the
      import forms (linted), V5 (counted; the validator run on a copy with one 429 removed), S1,
      S9 (17,552 probes), the Compose ports, and the agents' new grounds W2, W3, T3 and R11
- [x] Fork dry-run: bootstrap's output read on an untouched clone, then the printed steps through
      `npm test`, `docs:openapi:check` and the fork's `docker:smoke` on a second (audit § 5)
- [x] Appendix B scans (audit § 6)
- [x] Every agent grade on a caveat verified by the main thread by reproduction; items the main
      thread did not check are marked _(agent)_

## Phase 2 — the audit record

- [x] `docs/internal/audits/saas-readiness/audit-2026-10-12.md`, same sections as the last run
- [x] `SAAS-BASE-CHECKLIST.md`: audit date and link, verdict, criteria, scorecard, gates, top gaps
- [x] `FINAL-AUDIT-SUMMARY.md`: status paragraph, "as of", § 4 caveat rows and notes, § 6 lineage
      row, § 8 next actions, § 9 links
- [x] `docs/internal/audits/saas-readiness/README.md` lists the new run
- [x] `CLAUDE.md` live-risk line and `docs/tutorials/fork-and-rebrand.md` § 5 restated from this
      run's result
- [x] Todos: W1 and W2 each filed; W3 raised to P2 in the bootstrap leftovers todo, with T3 and
      W7 added to it; the V1 and V2 todos marked Closed, the V3 and S10 todos Partly, the S9 todo
      confirmed. W4 to W6 are P3 and have no todo; they are in the audit's § 6 and § 9
- [x] Loose ends from #157: `fork-test-credentials` D-04 to Accepted; the S10 todo names #157

## Discovered

- [x] Found: the grader placed the peer address a transaction carries under V3, and also listed it
      as a new finding → recorded as graded, C5 stays open (D-03). The main thread did not move it
      across the line that decides the verdict
- [x] Found: `JWT_SECRET` is `min(1)` (W2, P2) → filed as
      `docs/internal/todos/2026-10-12-todo-jwt-secret-has-no-minimum-length.md`
- [x] Found: bootstrap and a `DB_USER` that is not the template's (W3, P2) → raised in
      `docs/internal/todos/2026-10-12-todo-fork-bootstrap-review-leftovers.md`
- [x] Found: the architecture agent's "new" domain-to-application finding is R11, already on file
      → reported under R11 with the agent's severity (audit § 4.3)
- [x] Found: ADR-0036's sentence on `guest` credentials does not hold for `RABBITMQ_URL` (W4) →
      out of scope to edit here; named in the audit's § 4.5 and § 9
- [x] Found: a first try at the production reproductions passed the environment as one string,
      and the server rejected `NODE_ENV` → rerun through a script; only the rerun is cited
- [x] Not done: an error event was not captured for V3 (provoking a 5xx needs a write); the fork
      ran on throwaway containers, not its own Compose file, which `Fork Smoke` covers on
      `5bb4e3a`; W4 to W7 and the ADR sentences were not run
- [x] Touched on the owner's stack: one failed login in the development reproduction of V2
      counted once against that address's lockout in the development Redis. Nothing else
- [x] Left behind: two scratch clones and several scratch directories in the session scratchpad
      (a hook refuses `rm -rf`). The three throwaway containers and the smoke image were removed

## Acceptance

- [x] **AC-1** — A new dated file exists and no earlier audit file is modified: `git diff` on every
      other `audit-*.md` is empty. _Why:_ ADR-002.
- [x] **AC-2** — Each of C1 to C6 carries a grade from an agent or, for C1, from the fork run, with
      evidence at `5bb4e3a`. _Why:_ ADR-008.
- [x] **AC-3** — V1 to V5 are each graded by an agent and reproduced against running code: V1, V2,
      V4 and V5 closed; V3 open, on a transaction captured from the built server. _Why:_ ADR-012
      closes a caveat only on a confirmed route.
- [x] **AC-4** — Every gate was run on Node 24.21.0 after `npm ci`, with real exit codes.
      _Why:_ ADR-001 criterion 2.
- [x] **AC-5** — All 65 items re-graded (50 / 11 / 4, unchanged), and ADR-001 evaluated criterion
      by criterion: passes. An item with no new evidence kept its grade (D-04). _Why:_ the
      scorecard is the root checklist's content.
- [x] **AC-6** — No fix was graded by the session that wrote it, and no agent's caveat grade was
      overturned: the one open grade was reproduced and stands. _Why:_ a self-graded GOLD is the
      failure the independent run of 2026-05-24 exists to prevent.
- [x] **AC-7** — The verdict follows from the evidence under the rule fixed in D-02: one of the
      eight conditions is open, so no GOLD restatement (D-03). _Why:_ the rule is written before
      the result so it cannot bend to it.
- [x] **AC-8** — Root checklist, summary, `CLAUDE.md` and the tutorial point at the new run; each
      of the three P2 findings has a todo. _Why:_ ADR-002.

## Gates

Run on Node 24.21.0 at `5bb4e3a` after `npm ci`; the branch changes Markdown only.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0, re-run after the docs were written
- [x] tests — exit 0 on the first run: unit 971 passed; integration 228 passed, 5 skipped. Unit
      re-run after the docs were written
- [x] build — exit 0
- [x] OpenAPI — `docs:openapi:check` exit 0, no drift
- [x] security delta — `check` exit 0 (3 medium); `gate` `passed=true blocking=0`
- [x] image smoke — `docker:smoke` exit 0, seven checks
- [x] extra: `contract:local:gate` exit 0 (1442 generated, the 2 known warnings);
      `test:unit:security-framework` exit 0; CI on `5bb4e3a` green in all four workflows
