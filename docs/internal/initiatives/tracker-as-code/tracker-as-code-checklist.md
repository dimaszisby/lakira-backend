# The issue tracker as code — Checklist

Lean kit: the acceptance criteria are stated here. Built on `origin/dev` at `6049cc6` (#229), from
lakira-frontend `dev` at `9459cde`.

## Acceptance criteria

- **AC-1** — `.github/labels.json` holds every type, tier, severity and state the register uses,
  each with a description GitHub can store, and every label a form applies is in it. _Why:_ the
  labels carry the ranking (ADR-0084, D-02).
- **AC-2** — `npm run labels:sync` prints the plan against this repository and writes nothing
  without `--apply`. _Why:_ the sync deletes labels.
- **AC-3** — The pull request template carries the backend's gates and its security checklist.
  _Why:_ D-03.
- **AC-4** — A fork's form chooser and `SECURITY.md` name the fork's repository. _Why:_ D-04.
- **AC-5** — `SECURITY.md` exists, and the forms' security link works once private reporting is
  turned on. _Why:_ owner's choice, 2026-10-27 (D-04).
- **AC-6** — The logCount record (frontend #170) has a todo and a register row, and the B-60 test
  passes. _Why:_ owner's choice, 2026-10-27; the register files every Notion record.

**Out of scope.** Steps 2 to 4 of ADR-0084; fixing the logCount bug (B-100).

## Work

- [x] `chore/tracker-as-code` cut with `--no-track` from `origin/dev` at `6049cc6`; HEAD and
      upstream verified
- [x] Kit README, this file, `decisions.md` D-01 to D-04 (D-01 promoted to ADR-0084)
- [x] `__tests__/unit/github-tracker.test.ts`, red first (no script), then against a
      `labels.json` missing `state:owner`: two checks failed, as they should
- [x] `.github/labels.json` (17 labels), `.github/ISSUE_TEMPLATE/` (task, bug, decision,
      `config.yml`), `.github/pull_request_template.md` merged (D-02, D-03)
- [x] `scripts/github/sync-labels.ts` and `npm run labels:sync`, in `docs/reference/commands.md`
- [x] `SECURITY.md` (D-04); `scripts/bootstrap-fork.sh` renames it and `config.yml`, with a test
      seen to fail first
- [x] `docs/reference/issue-tracker.md`, in `docs/README.md`; `fork-and-rebrand.md` § 3
- [x] ADR-0084, its index row, ADR-0085 next; `CLAUDE.md` 84 ADRs
- [x] The logCount record: `2026-10-28-todo-metrics-list-log-count-zero.md`, register row B-100
- [x] #229's loose ends: `audit-0605-reread` D-01 to D-05 Accepted, README Done; B-61 names
      `#229 (6049cc6)`; "As of" `6049cc6`

## Discovered

- [x] Found: the metrics list's cache is not invalidated by a new log, a likely cause of the
      logCount record → in the todo, marked as an inference to confirm with a failing test
- [x] Found: lakira-frontend's `issue-tracker.md` says its bootstrap rewrites the form chooser's
      security link, and its `bootstrap-fork.sh` does not → the frontend's, noted in the handover

## Acceptance

- [x] AC-1 — `github-tracker.test.ts` › labels.json and ISSUE_TEMPLATE cases
- [x] AC-2 — `npm run labels:sync` against this repository: 17 to create, 0 to update, 9 to
      delete (GitHub's defaults, carried by no issue or pull request), "Dry run: nothing was
      written"
- [x] AC-3 — the template's Verification table and Security checklist
- [x] AC-4 — `bootstrap-fork.test.ts` › "the security reporting links"
- [x] AC-5 — `SECURITY.md`; turning reporting on is the owner's command after merge
- [x] AC-6 — `debt-register-todos.test.ts` passes with B-100

## Gates

Node 24.22.1.

- [x] typecheck, lint, format — clean
- [x] tests — unit with coverage, 161 suites, 1724 tests. Integration not run: no `src/` change
- [x] build — clean
- [x] OpenAPI, image smoke, security delta — not run: no route, image or dependency change
