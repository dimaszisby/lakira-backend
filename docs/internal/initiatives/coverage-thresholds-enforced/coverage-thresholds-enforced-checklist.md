# Coverage thresholds enforced — Checklist

## Acceptance criteria

A Lean kit has no plan, so the criteria are stated here.

- **AC-1** — With a threshold raised above current coverage, `test:unit:coverage` exits non-zero
  and names the threshold, and so does `test:integration:coverage`.
  _Why:_ the todo's proof; that is how the gap was found.
- **AC-2** — At the real thresholds both scripts exit 0, and Jest prints no "coverageThreshold is
  not supported" warning.
  _Why:_ the fix must not fail CI at today's coverage.
- **AC-3** — A unit test shows each value of `JEST_COVERAGE_PROJECT` selects its project's
  thresholds, unset selects none, an unknown value throws, and no project carries
  `coverageThreshold`.
  _Why:_ a regression to per-project thresholds passes silently, as it did for months.
- **AC-4** — The live docs describe what now happens; dated kit records are left as written.
  _Why:_ the todo lists four documents that claimed enforcement.

## Phase 0 — kit and branch

- [x] `fix/coverage-thresholds-enforced` cut with `--no-track` from `origin/dev` at `f5eea43`; HEAD
      and upstream verified
- [x] `README.md`, this file, `decisions.md` D-01

## Phase 1 — the fix

- [x] `__tests__/unit/jest-coverage-thresholds.test.ts`, written first: on the old config four of
      its five cases failed
- [x] `jest.config.mjs` — `COVERAGE_THRESHOLDS` at the root, chosen by `JEST_COVERAGE_PROJECT`;
      no project carries `coverageThreshold`
- [x] `package.json` — `test:unit:coverage` and `test:integration:coverage` set
      `JEST_COVERAGE_PROJECT`

## Phase 2 — docs

- [x] `.claude/rules/testing.md` § Coverage Thresholds
- [x] `docs/how-to/testing/run-the-test-suites.md`, `docs/how-to/ci-cd/daily-pipeline-playbook.md`
- [x] ADR-0065: a dated note under Consequences
- [x] Register: B-69 to Closed; the todo closed

## Discovered

- [x] Found: a failing test in the mutated run also exits 1, so the first unit proof could not
      tell the threshold from the test → in scope, the proof was rerun with the new test excluded,
      and passed every test while failing on the threshold

## Acceptance

- [x] AC-1 — unit statements raised to 99: 1293 passed, exit 1, "Coverage for statements (79.83%)
      does not meet "global" threshold (99%)"; integration statements raised to 99: 273 passed,
      5 skipped, exit 1, "(77.52%) does not meet "global" threshold (99%)". Both restored
- [x] AC-2 — `test:coverage` exits 0: unit 1298 passed (79.83 / 61.14 / 70.75 / 80.15),
      integration 273 passed, 5 skipped (77.52 / 52.25 / 78.24 / 78.71); no "not supported" warning
- [x] AC-3 — `jest-coverage-thresholds.test.ts`, five cases
- [x] AC-4 — Phase 2

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — `test:coverage`: unit 1298 passed; integration 273 passed, 5 skipped
- [x] build
- [x] OpenAPI — no drift
- [ ] security delta — skipped: no dependency changes
- [ ] image smoke — skipped: no Dockerfile or dependency changes
