# Unit Tests

**Status:** Active
**Last updated:** 2026-04-13

Unit tests validate backend logic in memory (no real Postgres/Redis/network).

## Scope

In scope:

- Domain entities
- Application use-cases/queries
- Controllers/routers with mocked dependencies
- Utility and middleware logic that does not require real infrastructure

Out of scope:

- Real DB/Redis HTTP wiring (integration layer)
- API contract conformance (contract layer)

## Commands

```bash
npm run test:unit
npm run test:unit:coverage
```

## Authoring Rules

- Mirror `src/**` structure under `__tests__/unit/**`.
- Prefer deterministic fixtures and explicit assertions.
- Mock external adapters (`repository`, `cache`, `token`, `redis`, `sequelize`).
- Add regression tests for fixed bugs.

## CI Expectations

- Unit tests run before integration tests.
- Coverage thresholds are enforced via Jest config.
- Coverage/JUnit artifacts are uploaded by CI.

## References

- `WORKFLOW_GUIDELINES.md`
- `unit-tests-plan.md`
- `unit-tests-checklist.md`
- `metrics-tracker.md`
- `decisions.md`
- `incidents.md`
