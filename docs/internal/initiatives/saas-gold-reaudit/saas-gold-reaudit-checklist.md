# SaaS GOLD re-audit — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Checked against `origin/dev` at
`b12ec62` (#120).

## Phase 0 — kit and branch

- [x] `docs/saas-gold-reaudit` cut with `--no-track` from `dev` pulled at `b12ec62`
- [x] This kit: README, checklist, `decisions.md` with D-01..D-06
- [x] `npm-audit-findings/README.md` status set to merged in #120 (loose end of the previous task)

## Phase 1 — evidence

- [x] Gates run on Node 24.21.0 after `npm ci`, each exit code recorded (audit § 2)
- [x] Delta pass: C1–C6, the open 2026-06-05 rows, ADR-0035..0050 and stale `Proposed` records,
      each labelled (audit § 4), by `security-reviewer` and `architecture-auditor` in parallel (D-01)
- [x] Fresh pass over the areas changed since `a0301b6` (audit § 6)
- [x] Fork dry-run on a fresh `--no-local` clone, with a throwaway `postgres:18` carrying the fork's
      own settings; Appendix B scans (audit § 5, § 6)
- [x] Every P1, every caveat status change and every P2 claiming a wrong result reproduced or read
      at the cited lines; unverified agent items marked _(agent)_ in the audit

## Phase 2 — the audit record

- [x] `docs/internal/audits/saas-readiness/audit-2026-09-29.md`
- [x] `SAAS-BASE-CHECKLIST.md` points at the new run: verdict, criteria, scorecard, gates, top gaps
- [x] `FINAL-AUDIT-SUMMARY.md`: status paragraph, "as of", § 4 C1/C3/C4 cells and note, § 6 lineage
      row, § 8 item 5 struck and item 7 added, § 9 links
- [x] `saas-readiness/README.md` lists the new run
- [x] New findings filed: `2026-09-29-todo-fork-test-credentials.md` (C1),
      `…-error-envelope-residuals.md` (C3), `…-register-rate-limiter.md` (R1),
      `…-list-cache-key-nested-filters.md` (R2), `…-build-image-in-ci.md` (R6); notes appended to
      `2026-09-22-todo-feature-boundary-rule-scope.md` (C4),
      `2026-09-24-todo-inject-features-into-router-factories.md` (R5) and
      `2026-09-25-todo-integration-parse-error-flake.md` (R3, R4). P3 findings stay tracked in the
      audit's § 6

## Discovered

- [x] Found: C1's closure fails on a fresh fork → recorded as the audit's main result (D-03), filed
      as `docs/internal/todos/2026-09-29-todo-fork-test-credentials.md`. Fixing it is out of scope
      for an audit
- [x] Found: the first fork reproduction was invalid. Docker Desktop did not share the scratchpad
      path, so the container logged `ignoring /docker-entrypoint-initdb.d/*` and never ran the
      fork's init SQL. The same file was then applied as `POSTGRES_USER`, which is what the
      entrypoint does, and the result recorded is from that run
- [x] Found: the parse-error flake recurred on the first integration run after `npm ci` → evidence
      appended to its todo; the gate is graded on the reruns, and that call is stated in audit § 2

## Acceptance

- [x] **AC-1** — A new dated audit file exists, and no prior audit file is modified. `git diff` on
      `docs/internal/audits/saas-readiness/audit-2026-0[56]*.md` is empty. _Why:_ ADR-002.
- [x] **AC-2** — Each C1–C6 closure is confirmed or reopened with evidence from HEAD: C2, C5, C6
      confirmed; C1 reopened P1 (D-03); C3, C4 reopened P2 (D-05), each reproduced. _Why:_ ADR-008.
- [x] **AC-3** — All ADR-001 gates run on Node 24.21.0 with real exit codes. _Why:_ § 8 item 5.
- [x] **AC-4** — All 65 items re-graded (47 / 14 / 4), and ADR-001 evaluated criterion by criterion:
      passes. _Why:_ the root checklist deferred the re-grade to this run.
- [x] **AC-5** — The verdict follows from the evidence: C1 open, so no GOLD restatement; GOLD WITH
      CAVEATS reconfirmed. _Why:_ ADR-008.
- [x] **AC-6** — The fork dry-run was executed, not inferred (audit § 5). _Why:_ C1 and C2 are
      fork-flow claims.
- [x] **AC-7** — Root checklist and summary point at the new run; every P1 and P2 finding is tracked
      in a todo. _Why:_ ADR-002.

## Gates

Run on Node 24.21.0; the branch changes Markdown only.

- [x] typecheck — exit 0 (audit § 2)
- [x] lint — exit 0
- [x] format — exit 0, re-run after the docs were written
- [x] tests — unit 621/621; integration 202 passed, 5 skipped on reruns (first run: 1 flaky failure)
- [x] build — exit 0
- [x] OpenAPI — `docs:openapi:check` exit 0, no drift
- [x] security delta — `passed=true`; no dependency change on this branch
