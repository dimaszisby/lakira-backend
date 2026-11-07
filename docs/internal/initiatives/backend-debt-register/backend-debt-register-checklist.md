# Backend debt register — Checklist

## Phase 0 — kit and rule

- [x] `docs/backend-debt-register` cut with `--no-track` from `origin/dev` at `bf72b58`; HEAD and
      upstream verified
- [x] `README.md`, `backend-debt-register-plan.md`, this file
- [x] `decisions.md` D-01, the ranking rule, written before any row was ranked

## Phase 1 — the register

- [x] `register.md` — 61 rows (`B-01` to `B-61`), four owner questions (`O-01` to `O-04`), two
      notes that are the frontend's to raise
- [x] Every todo file not marked closed or fixed has a row: 35 files, the one this kit files
      included. Two more are marked Partly and their open part is B-01 and B-08. One,
      `2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md`, reads as open by its status line
      and is closed: its last item has its own todo
- [x] Every open finding of `audit-2026-10-12.md` § 4 and § 6 has a row
- [x] Every live record of the Notion page has a row: four in Part 1, two in Part 2
- [x] `decisions.md` D-02 (grouping) and D-03 (what is not analysed)

## Phase 2 — the analyses

- [x] `analysis-w1-sentry-peer-address.md` — B-01
- [x] `analysis-analytics-relative-range.md` — B-02, B-49
- [x] `analysis-decisions-owed-to-frontend.md` — B-03, B-04, B-15
- [x] `analysis-client-ip-and-trust-proxy.md` — B-05
- [x] `analysis-probes-after-body-parsers.md` — B-06
- [x] `analysis-w2-jwt-secret.md` — B-07, with B-17
- [x] `analysis-w3-t3-fork-bootstrap.md` — B-08, B-09
- [x] `analysis-r11-domain-imports-application.md` — B-10
- [x] `analysis-w4-rabbitmq-guest-url.md` — B-12
- [x] `analysis-set-cookie-and-304-in-spec.md` — B-13
- [x] `analysis-x-request-id.md` — B-14

## Phase 3 — the rule

- [x] `.claude/rules/workflow.md` § What's next
- [x] `CLAUDE.md` § Frequently needed — a pointer to the register
- [x] `docs/internal/todos/2026-10-13-todo-analytics-relative-range-and-lifecycle-timestamps.md`
- [x] Loose end from #158: `saas-reaudit-2026-10-12/README.md` names #158

## Discovered

- [x] Found: three values the repo itself uses are shorter than the 32 characters B-07 would
      require, one of them in the production-mode image smoke → in scope of B-07's analysis, § 3
- [x] Found: a second `jwt.sign` path, `src/utils/token-generator.ts:18`, used only by the
      contract seed and its own test → noted in B-07's analysis, § 7; no row of its own
- [x] Found: `POST /auth/refresh` already documents the cookie it reads; the todo's wording
      suggested it did not → B-13's analysis says what is and is not documented
- [x] Found: the count of rows with no recorded severity is 17, not a handful → named in the
      plan's risks and D-03, with B-24 put forward for grading first
- [x] Found: one unexplained test failure of 2026-10-11 had no todo → row B-55; out of scope to
      file a todo for a failure seen once, as B-54 already shows the pattern
- [x] Not done: no reproduction was run for this kit. Every reproduction cited is from the audit
      of 2026-10-12 or from the frontend's reports, and each analysis says which

## Acceptance

- [x] AC-1 — verified by a loop over `docs/internal/todos/`: 35 open files, each named in
      `register.md`; the one file it reported missing is the closed one above
- [x] AC-2 — rows are one line with a link; no todo body is restated
- [x] AC-3 — D-01 precedes the register in this branch's history of edits; the two places the
      order needs explaining are in the register (B-02's state, B-09's size)
- [x] AC-4 — ten analyses have all eight sections; the eleventh, on decisions owed, is a note per
      ask, as planned. 35 full `path:line` references were checked by script (file exists, line
      within the file) and the bare `:line` references were read against the code by hand; two
      were wrong and are corrected. The frontend's proxy path is in the other repo and was
      checked there
- [x] AC-5 — each analysis ends with "Not verified"
- [x] AC-6 — `.claude/rules/workflow.md` § What's next
- [x] AC-7 — `git status` shows only `docs/`, `.claude/rules/workflow.md` and `CLAUDE.md`

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests
- [x] build
- [ ] OpenAPI — not run: no route, Zod schema or `src/lib/openapi/**` change
- [ ] security delta — not run: no dependency change
