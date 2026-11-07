# ADR-0066 — JUnit reports come from jest-junit 17

- **Status:** Accepted (merged in #183, `cbb7b87`)
- **Date:** 2026-10-18
- **Related:** [ADR-0065](./adr-0065-tests-run-on-jest-30.md) (the Jest the reporter runs under)
- **Origin:** `D-09` in the npm-audit-findings kit —
  [`npm-audit-findings`](../../internal/initiatives/npm-audit-findings/decisions.md); register row
  B-25 ([todo](../../internal/todos/2026-10-06-todo-npm-audit-findings-october.md))

> **Status note (2026-10-21).** The `backend-coverage` artifact is now two,
> `backend-coverage-unit` and `backend-coverage-integration`, one per test job, and the JUnit reports
> ride in them. Each suite runs once, with coverage
> ([ADR-0081](./adr-0081-ci-runs-the-suites-in-parallel-behind-a-gate.md)).

---

## Context

`jest.config.mjs` writes JUnit XML through `jest-junit` to `coverage/junit/`: `unit.xml`,
`integration.xml` and `unit-security-framework.xml`, named by `JEST_JUNIT_OUTPUT_NAME`. CI uploads
them inside the `backend-coverage` artifact; nothing in CI parses them.

`jest-junit` 16 depends on `uuid` 8, inside the range of the advisory "Missing buffer bounds check
in v3/v5/v6 when buf is provided" (`<11.1.1`). 17.0.0 declares `uuid` `^14` and crosses the
declared `^16`. Its code differs from 16 in one place: `uuid` is loaded by a dynamic `import()`,
so the output-path functions and `onRunComplete` are async. `uuid` is used only for
`uniqueOutputName`, which this repository does not set. It requires Node 20 or later.

## Decision

- **`jest-junit` `^17.0.0`.** Nothing else in `package.json` changes. The reporter options in
  `jest.config.mjs` (`outputDirectory`, `outputName`, `ancestorSeparator`, `classNameTemplate`,
  `titleTemplate`) are unchanged.
- **The XML keeps its shape, checked rather than assumed.** Each file was written by 16 and by 17
  on the same tree and compared with `time` and `timestamp` removed. Sorted, every `<testsuite>`
  and `<testcase>` element is identical, as is the root `<testsuites>`. Unsorted, only the order of
  suites differs, which varies from run to run.

## Options considered

- **An `overrides` pin of `uuid` under `jest-junit` 16.** Rejected: it crosses 16's own `uuid`
  range, and the dependency policy keeps overrides for findings no release fixes. 17 fixes it.

## Consequences

- `npm audit`: 26 findings to 25, 0 critical, 3 high, 22 moderate. Production is unchanged at
  2 moderate. `uuid` is still reported through `sequelize`, the root D-04 accepts.
- The lockfile: `jest-junit` 16.0.0 to 17.0.0 and `uuid` 14.0.3 nested under it. Nothing else moves,
  and no install script is added.
- What B-25 has left has no fix: `braces` under `nodemon`, and `sprintf-js` under `js-yaml` 3.
- The commented-out "Upload Jest test reports" step in `backend-ci.yml` points at `reports/jest`,
  which nothing writes. It is left as it is.

## Enforcement

- `npm test` writes `coverage/junit/*.xml` on every run, in CI and locally.
- `npm audit` and the security delta gate (`npm run security:delta:gate`).

## Links

- Decision log: [`npm-audit-findings` D-09](../../internal/initiatives/npm-audit-findings/decisions.md)
- Policy: [`docs/reference/security/dependency-policy.md`](../../reference/security/dependency-policy.md)
