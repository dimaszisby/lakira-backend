# Unit Tests Plan

**Status:** Active
**Last updated:** 2026-04-13

## Objective

Sustain reliable in-memory coverage for domain/application/controller logic while keeping CI feedback fast.

## Priorities

1. Keep mirrored suite structure under `__tests__/unit/**` for changed modules.
2. Maintain deterministic tests and avoid infrastructure coupling.
3. Preserve and improve enforced coverage thresholds.
4. Track runtime/coverage movement and incident patterns.

## Success Criteria

- Unit suites remain green in local + CI runs.
- Coverage thresholds remain satisfied.
- Regressions are captured as tests and documented in trackers.

## Tracking

- `unit-tests-checklist.md`
- `metrics-tracker.md`
- `decisions.md`
- `incidents.md`
