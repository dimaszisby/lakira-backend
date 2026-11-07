# Tests in parallel — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `2c1c098` (#203),
baseline run 39613579195 (12m25s).

## Acceptance criteria

- **AC-1** — Each Jest project runs once per pipeline, with coverage and its thresholds. _Why:_
  the plain runs repeated them and nothing read their output.
- **AC-2** — The unit and integration suites run in parallel jobs; the unit job has no service
  containers. _Why:_ B-85, the owner's ask.
- **AC-3** — The required check `Unit & Integration Tests` passes only when both suites passed,
  and fails, rather than skips, when either fails. _Why:_ the rulesets require it by name.
- **AC-4** — `unit`, `integration` and `contract_local` still depend on `Security Delta Checks`;
  the deploy jobs depend on the tests and `contract_local`. _Why:_ `.claude/rules/security.md`;
  a deploy must not outrun a failed suite.
- **AC-5** — The pipeline's wall-clock time on this PR's own run is measured and reported against
  the baseline. _Why:_ the estimate (about four minutes) is not a measurement.

## Phase 0 — kit and branch

- [x] `ci/tests-in-parallel` cut with `--no-track` from `origin/dev` at `2c1c098`; HEAD and
      upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 and D-02

## Phase 1 — the workflow

- [x] `backend-ci.yml`, written in the scratchpad (the hook blocks `.github/workflows/`): `unit`,
      `integration`, the `tests` gate, `contract_local` and the deploy jobs' `needs`, the build in
      `checks`
- [x] `actionlint` 1.7.12 (checksum verified): no findings on the new file
- [x] The unit project passes with no database, no Redis and no `dist/` (1516 tests)
- [x] The integration project passes with no `dist/`: 34 suites on a first run, and the other 9 on
      a rerun once a throwaway RabbitMQ was running (Discovered)
- [ ] The owner copies the file into `.github/workflows/` (handover)

## Phase 2 — docs and register

- [x] ADR-0081; ADR README row and next number; CLAUDE.md count 81; ADR-0066 status note
- [x] `pipeline-overview.md`, `branch-protection.md` (the gate closes half of pending change 1),
      `daily-pipeline-playbook.md`, `.claude/rules/security.md`
- [x] Register: B-85 to Closed; "As of" `2c1c098`; the B-85 todo closed
- [x] #203's loose ends: register D-10 Accepted; B-78's and B-84's Closed rows and the B-78 todo
      name `#203 (2c1c098)`; `queue-failure-paths` README Done

## Discovered

- [x] Found: with `if: always()`, the gate also fails when `Security Delta Checks` fails and the
      suites are skipped, so `Unit & Integration Tests` can no longer pass without them → in scope,
      `branch-protection.md` pending change 1 says so; `contract_local` can still be skipped
- [x] Found: on the first integration run the throwaway RabbitMQ exited at start under Docker
      memory pressure, failing the 7 queue suites, and two other tests got a `socket hang up` → the
      rerun passed; the hang-ups are recorded on B-11's todo
- [x] Found: nothing ruleset-side needs changing. The gate keeps the required name; no PR is
      merged against a check that never reports

## Acceptance

- [x] AC-1 — the new `backend-ci.yml`: one `test:unit:coverage` step and one
      `test:integration:coverage` step, no plain runs
- [x] AC-2 — `unit` and `integration` both `needs: security_delta` only; `unit` has no
      `services:`
- [x] AC-3 — the `tests` job: `needs: [unit, integration]`, `if: always()`, and a step that fails
      unless both results are `success`. Green on run 39624267200; the red path was
      not exercised (no failing commit pushed) and follows from the step
- [x] AC-4 — `unit`, `integration`, `contract_local`: `needs: security_delta`; `deploy_staging`,
      `deploy_production`: `needs: [tests, contract_local]`
- [x] AC-5 — PR #204's run 39624267200: **2m45s** end to end, from 12m25s (run 39613579195).
      Unit Tests 2m00s and Integration Tests 2m04s side by side, `contract_local` 1m23s alongside,
      the gate 3s

## Gates

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file and on the new workflow: clean
- [x] tests — `test:unit:coverage` 1516 passed with no database, Redis or `dist/`;
      `test:integration:coverage` 43 suites passed across two runs without `dist/` (see above)
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean
- [x] actionlint — clean (its shellcheck pass is off: shellcheck is not installed)
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
