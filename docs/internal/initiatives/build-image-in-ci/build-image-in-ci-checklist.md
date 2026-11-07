# Build Image in CI — Checklist

## Acceptance criteria

A Lean kit has no plan, so the criteria are stated here.

- **AC-1** — `npm run docker:smoke` passes on the current tree, with all six checks reported by
  name. _Why:_ R6: the image must be built and started somewhere other than by hand.
- **AC-2** — It fails on an image without `ENV NODE_ENV=production`, and on one whose `bcrypt` has
  no native binary, each at the named check. _Why:_ a smoke that cannot fail proves nothing.
- **AC-3** — It leaves no container, network or volume behind, after a pass or a failure, and does
  not touch the running Compose stack. _Why:_ it runs on developers' machines too.
- **AC-4** — `.github/workflows/image-smoke.yml` exists, matches the reviewed content byte for
  byte, and its first run on the PR is green. _Why:_ R6 is about CI, not a local script.
- **AC-5** — ADR-0042's status says what is true: decided, not implemented. _Why:_ audit § 4.3.
- **AC-6** — The docs name the new gate, script and workflow. _Why:_ the rule must outlive the
  change.

## Phase 0 — Kit and branch

- [x] Branch `ci/build-image-in-ci` off `dev` at `6fc3c00`, `--no-track`
- [x] Kit: `README.md`, this checklist, `decisions.md` (D-01–D-04)

## Phase 1 — Script

- [x] `scripts/image-smoke.sh` — the six checks, exit-trap cleanup, `SMOKE_IMAGE` override, app
      container log on failure
- [x] `package.json` — `docker:smoke`
- [x] Passes on the current tree — all six checks, about two minutes including the build
- [x] Fails on the variant without `ENV NODE_ENV` — at check 4, "not the ADR-0036 refusal"
- [x] Fails on the variant without the `bcrypt` binary — at check 3, "No native build was found"
- [x] No leftovers — no `image-smoke-*` container or network after a pass, a failure, or a forced
      Docker error; volume count unchanged (8 before, 8 after); the Compose stack stayed up

## Phase 2 — Workflow (applied by the maintainer; the path is protected from Claude)

- [x] `.git/image-smoke.yml` written and shown; Prettier-clean
- [x] Copied to `.github/workflows/image-smoke.yml` — in #129
- [x] First run green on the PR — runs `36990709430` (push) and `36990715853` (pull request) at
      `eba69a4`, and `37043971353` on `dev` at `8222829`

## Phase 3 — Review, then fix

- [x] `code-reviewer` pass; each finding confirmed before acting — see Review

## Phase 4 — Docs

- [x] ADR-0055; registry row; next free moved to ADR-0056
- [x] ADR-0042 status note. Its registry row is unchanged: the status stays `Accepted` (D-03)
- [x] ADR-0050 status note; `__tests__/unit/dockerfile.test.ts` comment
- [x] `docs/reference/ci-pipeline/pipeline-overview.md` § 4
- [x] `docs/reference/commands.md` — `docker:smoke`; the `docker:build` row no longer says CI does
      not build the image (Prettier re-aligned the table)
- [x] `.claude/rules/workflow.md` § Gates — the image smoke row and a paragraph
- [x] `docs/how-to/ci-cd/daily-pipeline-playbook.md` — not changed: it does not list the workflows
- [x] `CLAUDE.md` — ADR count 54 → 55
- [x] `docs/internal/todos/2026-09-29-todo-build-image-in-ci.md` — fixed
- [x] `SAAS-BASE-CHECKLIST.md` § Top gaps item 7 — R6
- [x] Carried from #128: ADR-0054 `Accepted` (record, registry row, the five kit entries);
      `drainable-background-work/README.md` merged in #128 (`6fc3c00`)
- [x] Notion — no record: nothing the frontend sees changes

## Discovered

- [x] Found: `--ignore-scripts` does not break `bcrypt` 6, which ships prebuilt binaries → in
      scope; the second broken variant deletes the prebuilds instead
- [x] Found: `set -E` makes the error trap fire inside the command substitutions whose failure
      the checks expect, printing false FAIL lines on a passing run → in scope; the trap is set
      without `-E`, and a forced Docker error confirms it still fires for bare commands
- [x] Found: `Image Smoke` and `Fork Smoke` gate nothing unless they are required checks →
      out of scope, the maintainer's call; recorded in ADR-0055 § Consequences

## Acceptance

- [x] AC-1 — `npm run docker:smoke`, final script, final tree: six PASS lines, exit 0
- [x] AC-2 — both broken variants, exit 1 at the named check
- [x] AC-3 — leftovers check above
- [x] AC-4 — the workflow is in #129; its first runs on a GitHub runner passed (Phase 2)
- [x] AC-5 — ADR-0042 status note
- [x] AC-6 — Phase 4

## Gates

Final tree, Node 24.21.0, 2026-10-02.

- [x] typecheck — pass
- [x] lint — pass
- [x] format — pass
- [x] tests — unit 675 pass; integration 219 pass, 5 skipped
- [x] build — pass
- [x] OpenAPI — skipped: no route, schema or `src/lib/openapi/**` change
- [x] security delta — skipped: no dependency change
- [x] image smoke — pass

## Review

`code-reviewer` pass (read-only; it did not run Docker): 0 critical, 4 warnings, 9 suggestions.

- A Docker command failing outside a check (`docker port` on a crashed container, a failed pull)
  exited with no FAIL line and no app log — confirmed. An `ERR` trap now routes those through
  `fail`; a forced pull failure ends in `FAIL unexpected error at line 157`, exit 1, nothing left
  behind.
- `/ready` was asked once, though Redis may still be connecting when `/health` first answers —
  confirmed as a flake risk; it is retried until the same deadline.
- A crashed Postgres made the wait run its full 60 s — confirmed; the loop now stops when the
  container is no longer running and prints its log.
- Unauthenticated Docker Hub pulls can be rate-limited — true, and shared with the service
  containers in `backend-ci.yml`; not changed, recorded in ADR-0055 § Consequences.
- The release string was matched as a regex — changed to a fixed-string match.
- `persist-credentials: false` on checkout — added to the workflow.
- Confirmed by the reviewer: check 4 cannot pass when the image defaults to development; the JSON
  greps match what `res.json` emits; the 301 can only come from the production redirect; the
  environment passed is sufficient and not working by accident; the script is portable between
  bash 3.2 and 5; the workflow uses `pull_request`, read-only permissions and no secrets.
- Not changed: action versions are pinned by tag, as in every other workflow here; no build cache
  (the build is about two minutes); check 6 asserts the exit code, not a log line.
