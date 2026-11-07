# Unit Test Workflow Guidelines

**Status:** Active
**Last updated:** 2026-04-13

Use this checklist for any PR that changes unit-testable backend code.

## When to update unit tests

- Domain/use-case/query logic changes.
- Controller/router branching changes that can be tested with mocks.
- Shared utilities/middleware logic changes.
- Bug fixes in unit-testable paths.

## Per-PR workflow

1. Identify affected module(s) under `src/**`.
2. Add/update mirrored tests under `__tests__/unit/**`.
3. Cover happy path + failure/guardrail cases.
4. Run:
   - `npm run test:unit`
   - `npm run test:unit:coverage` (for risk-sensitive or broad changes)
5. Update tracker docs if scope changed materially:
   - `unit-tests-checklist.md`
   - `metrics-tracker.md`
   - `decisions.md` (if conventions/tooling changed)

## Quality guardrails

- Keep tests deterministic (avoid uncontrolled time/randomness).
- Prefer explicit assertions over broad snapshots.
- Never rely on live Postgres/Redis/network in this layer.
