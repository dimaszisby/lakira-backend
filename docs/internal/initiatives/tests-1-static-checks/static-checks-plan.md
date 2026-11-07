# Static Checks Plan

**Status:** Active
**Last updated:** 2026-04-13

## Objective

Keep static checks fast, deterministic, and enforced as the first CI gate.

## Core Gates

- `npm run lint`
- `npm run typecheck`
- `npm run format:check`
- `npm run docs:openapi:check`

## Priorities

1. Maintain CI-first order: static checks before runtime tests.
2. Keep command behavior aligned between local and CI.
3. Track runtime drift and rule/tooling changes in metrics/decisions docs.

## Success Criteria

- All static gates pass locally and in CI.
- Runtime remains within team-acceptable feedback window.
- OpenAPI drift is caught before merge.

## Tracking

- `static-checks-checklist.md`
- `metrics-tracker.md`
- `decisions.md`
- `incidents.md`
