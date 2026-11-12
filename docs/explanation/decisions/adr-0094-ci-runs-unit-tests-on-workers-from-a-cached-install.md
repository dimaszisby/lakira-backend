# ADR-0094 — CI runs the unit suite on workers, from a cached install, once per commit

- **Status:** Accepted
- **Date:** 2026-11-11
- **Related:** issue #286; updates [ADR-0081](./adr-0081-ci-runs-the-suites-in-parallel-behind-a-gate.md)'s
  reasoning on `--runInBand`, and keeps its rule that the test jobs wait for `Security Delta Checks`
- **Origin:** the CI audit of 2026-11-11; the trigger choice is the owner's, on 2026-11-11

---

## Context

Merging into `dev` waited about 6 minutes for the required checks. The critical path was the
security gate, then the unit job (runs 42771224133, 42771233517, 42768400449):

```
Security Delta Checks 51-67 s (npm ci 51 s, its checks 6 s)
  -> Unit Tests 164-278 s (npm ci 51 s, the tests 216 s) -> gate 3 s
```

- **The unit suite ran on one CPU** (`--runInBand`) on a runner with four. ADR-0081 set workers
  aside when each suite took under three minutes; the unit job had grown to 4.6.
- **One file was most of it:** `feature-boundaries.lint.test.ts`, 114 s, because it starts ESLint
  for each case. With workers, a suite cannot finish before its slowest file.
- **`npm ci` took 30-51 s in every job.** `setup-node` caches npm's downloads, not `node_modules`.
- **Every workflow ran twice for a working branch,** on its push and on its pull request. Both
  tested the same commit, and they sat in different concurrency groups, so neither cancelled the
  other.

## Decision

- **The unit suite runs on workers:** `--maxWorkers=75%` in `test:unit` and `test:unit:coverage`,
  which is three on CI's four CPUs. Locally, with coverage, it took 93 s against 262 s, with every
  test passing and the thresholds met. Integration and e2e keep `--runInBand`, since they share one
  database.
- **The ESLint boundary cases are in four files** of about 25-31 s each, which the workers share.
  Their helpers are in `__tests__/helpers/eslint-boundary-cases.ts`. All 75 tests remain.
- **`node_modules` is cached** by the composite action `.github/actions/install-deps`, keyed on the
  runner's OS, the exact Node version and `package-lock.json`. `npm ci` runs only on a miss.
  - Every `backend-ci.yml` job and `commit-lint.yml` use it.
  - `fork-smoke.yml` keeps its own `npm ci`: it installs a freshly bootstrapped fork.
  - The one install script, `prepare: husky`, writes git hooks that CI does not use.
- **A working branch runs on its pull request only.** `backend-ci.yml`, `fork-smoke.yml`,
  `image-smoke.yml` and `backend-prd-drift-warning.yml` run on `pull_request`, on a push to `dev`,
  `staging` or `main`, and by hand through `workflow_dispatch`.
- **ADR-0081's security-gate rule stays.** With the cache, the gate job's install shrinks, so its
  wait costs little.

## Options considered

- **Shard Jest across a job matrix:** more jobs and a coverage merge, for a suite that fits one
  runner once it uses its CPUs.
- **Let the tests start before the security gate:** ADR-0081 set it aside; the cache removes most
  of the wait it would save.
- **Keep the push runs on working branches** for an early signal before a pull request: in this
  repository's flow the pull request opens seconds after the push.
- **Cancel the push run when a pull request exists** by sharing a concurrency group: a run is still
  started, then killed.

## Consequences

- The PR for #286 measures the required checks before and after. The estimate was about 2.5-3
  minutes, down from about 6.
- A branch pushed without a pull request gets no CI until one opens, or until someone runs the
  workflow by hand.
- A cached `node_modules` is restored only for the same lockfile and Node version. A dependency
  change, or a new Node patch picked up by `check-latest`, is a miss and runs `npm ci`.
