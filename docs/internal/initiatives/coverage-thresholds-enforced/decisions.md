# Decisions — coverage-thresholds-enforced

## D-01 — The root config picks one project's thresholds by `JEST_COVERAGE_PROJECT`

- **Status:** Proposed
- **Date:** 2026-10-19

**Context.** `jest.config.mjs` set `coverageThreshold` inside the `unit` and `integration`
projects. Jest reads it only from the root configuration, so both coverage runs exited 0 whatever
the coverage; Jest 30 warns about it, Jest 29 ignored it silently (ADR-0065, register row B-69).
CI runs the two projects as separate commands, `test:unit:coverage` and
`test:integration:coverage`, and their thresholds differ, so one root threshold does not fit both.
**Decision.** Both sets of thresholds move to a `COVERAGE_THRESHOLDS` map in `jest.config.mjs`. The
root's `coverageThreshold` is the set named by `JEST_COVERAGE_PROJECT`, which each coverage script
sets beside `JEST_JUNIT_OUTPUT_NAME`. Unset, no threshold applies, so a coverage run of one file
still runs; any other value throws, so a typo cannot switch enforcement off. The todo's option 2,
with a variable of its own.
**Options considered.** Thresholds as `--coverageThreshold '<json>'` in each script: JSON inside an
npm script string, and the numbers leave the config. One root threshold at the lower of each pair:
the integration bar drops from 70 to 60 statements. Keying on `JEST_JUNIT_OUTPUT_NAME`, which the
scripts already set: enforcement would hang on a report's file name.
**Consequences.** A coverage run below its project's thresholds now fails CI's `tests` job. A
direct `npx jest --coverage` without the variable checks nothing, as before; the scripts are the
enforced path. `__tests__/unit/jest-coverage-thresholds.test.ts` fails if a project carries
`coverageThreshold` again.
