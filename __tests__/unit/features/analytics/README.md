# Analytics Unit Test Layout

Legacy suites once lived directly under `__tests__/unit/analytics`. With the vertical-slice migration now in effect, every analytics unit test sits inside the feature-aligned tree:

- `application/GetDashboardVisualization.test.ts` exercises the query with mocked ports and env guardrails.
- `application/GetDashboardVisualization.service.test.ts` (migrated from `dashboard-visualization.service.test.ts`) spies on Sequelize and cache adapters to validate lifecycle metadata + fallback behavior without touching the real DB.
- `domain/fallback-range.test.ts` keeps the guard-aware range math covered in isolation.

**When extending analytics coverage**

1. Keep new suites inside `application/`, `domain/`, or `infrastructure/` depending on their target layer.
2. Update `docs/internal/archive/test-classification-2025-12-22.md` so the catalog always matches the filesystem.
3. If a suite requires new CI wiring (env vars, Redis/DB toggles, etc.), add the guardrails to `docs/how-to/ci-cd/daily-pipeline-playbook.md` before landing the tests, mirroring the approach used for the earlier CI/CD and JWT work noted in the historical README.
