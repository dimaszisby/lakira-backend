# Todo — the coverage thresholds are not enforced

- **Status:** Open. Register row B-69
- **Created:** 2026-10-18
- **Owner:** unassigned
- **Origin:** the Jest 30 upgrade
  ([`npm-audit-findings` D-07](../initiatives/npm-audit-findings/decisions.md), ADR-0065). Jest 30
  prints a validation warning that Jest 29 did not

## What

`jest.config.mjs` sets `coverageThreshold` inside the `unit` and `integration` projects. Jest reads
`coverageThreshold` only from the root configuration; in a project it is ignored. Jest 30 says so
on every coverage run:

```
Option "coverageThreshold" is not supported in an individual project configuration.
Move it to the root configuration.
```

Jest 29 ignored it as well, without the warning. Reproduced on `dev` at `324fb19` (Jest 29.7.0):
with the unit project's statement threshold raised to 99 %, a coverage run of one test file
reported 3.98 % statements and exited 0.

Nothing fails today: on 2026-10-18 unit coverage was 78.63 / 59.84 / 69.08 / 78.91 and integration
76.68 / 50.74 / 76.97 / 77.93 (statements / branches / functions / lines), above every threshold.
What is wrong is the claim. These say the thresholds are enforced:

- `.claude/rules/testing.md` § Coverage Thresholds (corrected on `fix/jest-30` to point here)
- `docs/how-to/testing/run-the-test-suites.md` ("with coverage thresholds")
- `docs/how-to/ci-cd/daily-pipeline-playbook.md` ("enforce the coverage thresholds")
- the `tests-2-unit-tests` and `tests-3-integration-tests` kits, which recorded them as enforced

## Suggested fix

The two projects have different thresholds and run as separate commands, so one root
`coverageThreshold` does not fit both. Options to weigh:

1. Pass each project's thresholds on the command line, `--coverageThreshold '<json>'`, in
   `test:unit:coverage` and `test:integration:coverage`.
2. Keep them in `jest.config.mjs` and select them at the root by an environment variable the two
   scripts already set, such as `JEST_JUNIT_OUTPUT_NAME`, or a new one.
3. One root threshold at the lower of each pair.

Whichever is chosen, prove it the way it was disproved: raise a threshold above current coverage and
see the run exit non-zero. Then correct the documents above.
