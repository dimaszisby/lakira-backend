# ADR-0081 — CI runs each test suite once, in parallel, behind a gate that keeps the required check

- **Status:** Accepted
- **Date:** 2026-10-21
- **Related:** [ADR-0066](./adr-0066-junit-reports-from-jest-junit-17.md) (the JUnit reports);
  `.claude/rules/security.md` § Security CI Pipeline; `docs/reference/branch-protection.md`
- **Origin:** `D-01` and `D-02` in the tests-in-parallel kit —
  [`tests-in-parallel`](../../internal/initiatives/tests-in-parallel/decisions.md); register row
  B-85

---

## Context

`backend-ci.yml` took 12m25s on a pull request (run 39613579195, PR #203, 2026-10-21):

```
security_delta 24s ─┐
checks       55s ───┴─> tests 10m11s ─> contract_local 1m05s ─> deploy (staging/main only)
```

The `tests` job ran both Jest projects on one runner, one after the other, twice: `test:unit`
(2m46s) and `test:integration` (1m41s), then `test:unit:coverage` (2m50s) and
`test:integration:coverage` (1m53s). The coverage runs are the plain runs plus `--coverage` and the
thresholds, and nothing read the plain runs' output. `contract_local` waited for the tests although
it builds, migrates, seeds and starts its own server. The tests waited for `Lint & Typecheck`.

Three constraints shaped the change:

- The rulesets for `dev`, `staging` and `main` require the checks `Lint & Typecheck`,
  `Unit & Integration Tests` and `contract_local` by name.
- The test jobs and `contract_local` depend on `Security Delta Checks`, so a tripped gate stops the
  pipeline (`.claude/rules/security.md`).
- GitHub counts a **skipped** required check as passing.

## Decision

1. **Each suite runs once, with coverage**, which enforces its thresholds and writes its JUnit
   report.
2. **`unit` and `integration` are two jobs that run side by side.** `unit` has no service
   containers; `integration` has Postgres, Redis and RabbitMQ and runs the migrations first. Each
   uploads its own coverage artifact.
3. **`Unit & Integration Tests` is a gate job** that needs both suites, runs `if: always()`, and
   fails unless both succeeded. The required check keeps its name, and it can neither be passed by
   a skipped job nor be skipped itself.
4. **Only the security gate holds the test jobs and `contract_local` back.** Lint, typecheck and
   the build, which moves into `Lint & Typecheck`, run alongside them and still gate merging
   through the rulesets.
5. **The deploy jobs need `Unit & Integration Tests` and `contract_local`** by name; the chain no
   longer implies one through the other.

## Options considered

- _Rename the required checks in the three rulesets to the two new jobs._ A settings change on
  three rulesets, and a window between the YAML change and the settings change in which the
  required check never reports.
- _A gate without `if: always()`._ A failed suite would leave it skipped, and the required check
  would pass.
- _Shard Jest across a matrix, or drop `--runInBand`._ Each suite takes under three minutes on one
  runner; the gain does not pay for the moving parts yet.
- _Let the tests start before the security gate._ It saves 24 s and changes a rule the security
  pipeline relies on.

## Consequences

- The critical path is the security gate, the slower suite and the gate job, about four minutes.
  The measured figure for the first run is recorded in the kit's checklist.
- The repository is public, so the extra jobs cost no Actions minutes. Each repeats its own
  checkout and `npm ci`.
- A lint failure no longer stops the test jobs from starting; merging still waits for it.
- When `Security Delta Checks` fails, the suites are skipped and the gate fails, so
  `Unit & Integration Tests` cannot pass without them. `contract_local` can still be skipped while
  `Security Delta Checks` is not a required check (`branch-protection.md` § Pending changes).
- Coverage lands in two artifacts, `backend-coverage-unit` and `backend-coverage-integration`.

## Enforcement

The workflow itself: `actionlint` on `backend-ci.yml`, and the pull request's own CI run. A job
renamed, or a `needs:` dropped from the gate or a deploy job, is a review finding; nothing checks
the graph mechanically.

## Links

- Kit: [`tests-in-parallel`](../../internal/initiatives/tests-in-parallel/README.md)
- Todo: `docs/internal/todos/2026-10-21-todo-ci-wall-clock-time.md`
