# Static Checks

**Status:** Active
**Last updated:** 2026-04-13

Static checks are the first CI gate and must pass before runtime tests.

## Scope

- ESLint (`npm run lint`)
- TypeScript checks (`npm run typecheck`)
- Formatting checks (`npm run format:check`)
- OpenAPI drift check (`npm run docs:openapi:check`)

Out of scope: unit/integration/contract runtime tests.

## Local Execution

```bash
npm run lint
npm run typecheck
npm run format:check
npm run docs:openapi:check
```

## CI Expectations

- Static checks run before unit/integration tests.
- Any failure blocks the pipeline.
- Keep command definitions aligned with `package.json` and backend CI workflow.

## Maintenance

- Update this README when adding/removing static gates.
- Keep KPI and incident tracking in:
  - `metrics-tracker.md`
  - `decisions.md`
  - `incidents.md`
