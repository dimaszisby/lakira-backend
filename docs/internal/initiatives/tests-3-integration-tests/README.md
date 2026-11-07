# Integration Tests

**Status:** Active
**Last updated:** 2026-04-13

Integration tests validate real backend wiring (Express + Postgres, optional Redis paths).

## Scope

In scope:

- API flows under `__tests__/integration/api/**`
- Docs/OpenAPI route checks under `__tests__/integration/docs/**`
- Repository/infrastructure tests under `__tests__/integration/features/**`

Out of scope:

- Unit-only logic with mocks
- Postman/Newman + Schemathesis contract enforcement

## Environment Requirements

- Postgres available using `.env.test` settings
- Migrations applied before tests (`npm run db:migrate:test`)
- Optional Redis coverage via `ENABLE_REDIS_INTEGRATION=true`

## Commands

```bash
npm run integration:local
npm run test:integration
npm run test:integration:coverage
```

## CI Expectations

- Integration tests run after unit tests.
- Coverage thresholds for integration project are enforced in Jest config.
- Coverage + JUnit artifacts are uploaded in CI.

## References

- `integration-tests-plan.md`
- `integration-tests-checklist.md`
- `integration-tests-ticket.md`
- `metrics-tracker.md`
- `decisions.md`
- `incidents.md`
