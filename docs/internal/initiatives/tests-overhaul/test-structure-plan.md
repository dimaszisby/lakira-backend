# Lakira Backend Test Structure Plan

## Context & Goals

- Current layout under `__tests__/` is feature- and layer-aware but mixes unit and integration suites (see `docs/internal/archive/test-structure-concern/test-structure/test-structure-concern.md`).
- `test-classification-2025-12-22.md` confirms that 27/34 suites are pure unit tests (even infrastructure-level ones) while 7 suites hit the HTTP stack/DB.
- Goal: introduce `__tests__/unit/**` and `__tests__/integration/**` trees, align tooling, and refresh docs/CI so each test type (static, unit, integration, contract) is explicitly modelled.

## Test Type Definitions (Concise)

- **Static checks:** `eslint`, `tsc --noEmit`, formatting; no runtime code.
- **Unit tests:** Pure in-memory suites targeting domain logic, use-cases, schema validation, or repositories with mocked side effects. Must avoid real DB/HTTP/Redis.
- **Integration tests:** Suites that boot the Express app, run through HTTP handlers, or touch real Sequelize/Postgres/Redis instances.
- **Contract tests:** Black-box HTTP checks (Postman/Newman today) that run against local/staging deployments to verify the published API contract.

## Phases

### Phase 0 – Confirm definitions & capture state

1. Review `test-classification-2025-12-22.md` with the team; adjust any disputed classifications.
2. Lock the target folder schema in `test-structure-move-plan-2025-12-22.md`.
3. Decide where shared helpers (currently `__tests__/integration/helpers/test-utils.ts`) will live long-term (keep under `integration/helpers` or promote into a shared `tests/support` package).

### Phase 1 – Introduce folders & move suites

1. Create `__tests__/unit/` and `__tests__/integration/` roots.
2. Move the 27 unit suites into `__tests__/unit/**` mirroring their feature hierarchy.
3. Move the 7 HTTP/Swagger suites into `__tests__/integration/api/**` and `__tests__/integration/docs/**`.
4. Move `__tests__/helpers/test-utils.ts` into `__tests__/integration/helpers/` (or `tests/support/`) and update imports. Completed 2025-12-22.
5. Run `npm run lint` to catch any broken relative imports or path-alias regressions.

### Phase 2 – Tighten application & repo tests

1. Decide which application/repository suites need true integration coverage (e.g., `MetricRepoSequelize` against a real DB).
2. Track candidates and status in `docs/internal/initiatives/tests-overhaul/phase2-integration-coverage.md`, then for each:
   - Keep the current mocked suite inside `unit/`.
   - Add an integration sibling that relies on Sequelize + migrations inside `integration/features/**`.
3. Expand the helper library (fakes, DB fixtures) as needed.

### Phase 3 – Update docs & coverage

1. Update `docs/internal/initiatives/tests-2-unit-tests` and `docs/internal/initiatives/tests-3-integration-tests` to describe the new folder layout, tooling, and expectations.
2. Document helper usage (`withTestEnv`, integration helpers) and conventions (naming, env vars).
3. Adopt the proposed coverage settings from `test-tooling-recommendations-2025-12-22.md`.
4. Ensure contract-test docs mention how they relate to the new structure.

### Phase 4 – Align CI & automation

1. Update backend CI workflow(s) (`docs/ci-cd/backend/**`, GitHub Actions) to run:
   - Static checks (`lint`, `typecheck`).
   - `npm run test:unit` and `npm run test:integration` in distinct jobs/stages with coverage upload.
   - Contract tests (`test:contract:local` for preview env, `test:contract:staging` before promotion).
2. Ensure Docker Compose/infra scripts used in CI mirror the integration needs (DB/Redis ready, migrations applied).
3. Update pipeline docs/checklists to reference the new scripts and coverage artifact locations.

## Risks, Trade-offs & Rollback

- **Path alias churn:** Moving files may break implicit relative imports. Mitigation: keep imports absolute via `@/...`; run lint/tests after each batch move.
- **Test helper placement:** Integration helpers currently live at `__tests__/helpers`. Moving them requires updating dozens of imports. Plan a bulk search-and-replace and keep a fallback branch until green tests confirm success.
- **Jest config split:** Introducing multi-project config touches infra files (`jest.config.mjs`, setup files). Rollback plan: keep the old config on a branch until new scripts run green in CI; revert to single-project config if blocking issues appear.
- **DB lifecycle cost:** Integration suites truncate tables before every test via raw SQL. Consider grouping tests or seeding fixtures to manage runtime. Rollback option is to re-enable `SKIP_DB_LIFECYCLE` temporarily while optimizing.
- **Contract tests untouched:** This overhaul leaves Newman suites where they are; ensure doc updates make that explicit to avoid confusion.
