# Phase 3 Vertical Slice Plan – Auth & Beyond

- Timestamp: 2025-12-03T06:24:39Z

## Scope

- Complete the migration of the authentication stack into `src/features/auth`, including domain, application ports, infrastructure adapters, and HTTP wiring (already scaffolded).
- Establish a repeatable checklist for the next domains (metric settings, analytics, etc.).

## Current Status

- Auth slice is fully covered (unit + infra) and documented; legacy service/controller removed.
- Metric settings HTTP routes now resolve through `src/features/metric-settings`, backed by a repository/cache port. Legacy controller/service deleted.
- Analytics trend + dashboard/visualization endpoints are owned by `src/features/analytics/infrastructure/http`, so no controllers remain under `src/controllers`.
- Full regression (`npm run test:dev`) completed on 2025-12-03 with Docker-backed Postgres; covers auth, metrics, logs, metric settings, and analytics (23 suites / 109 tests).
- ESLint guardrails now prevent importing from `src/services` (`no-restricted-imports`), so future code must depend on feature slices.

## Immediate Tasks

1. **Analytics + metric settings hardening**
   - Add targeted integration/unit tests for analytics visualization SQL/cache paths and metric settings controller/repo seams (now that DB-backed regression is green).
   - Capture learnings in feature READMEs so future contributors know how to exercise the slices.
2. **Phase 4 preparation**
   - Draft options for ORM/model placement (per-feature vs. shared infra) and middleware wiring updates. _(Documented in `./phase4-plan.md`.)_
   - Identify any shared adapters still outside features (`src/routes`, `src/controllers`) and plan their removal in the Phase 4 checklist.

## Upcoming Domains

- With lint guardrails active, focus shifts to Phase 4 infrastructure alignment (see `phase4-plan.md`) and archiving `src/services` once empty.
