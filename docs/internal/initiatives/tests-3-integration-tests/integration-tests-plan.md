# Integration Tests Plan

**Status:** Active
**Last updated:** 2026-04-13

## Objective

Validate real backend wiring (HTTP + DB, optional Redis paths) before contract gates.

## Priorities

1. Keep integration environment reproducible (`.env.test`, migrations, local script parity).
2. Maintain API + repository + journey-level scenario coverage.
3. Keep Redis-dependent coverage opt-in but well-documented.
4. Preserve CI observability via coverage/JUnit artifacts.

## Success Criteria

- Integration suites stay stable and reproducible locally/CI.
- Coverage thresholds remain satisfied.
- Journey and infrastructure regressions are caught before contract stage.

## Tracking

- `integration-tests-checklist.md`
- `metrics-tracker.md`
- `decisions.md`
- `incidents.md`
