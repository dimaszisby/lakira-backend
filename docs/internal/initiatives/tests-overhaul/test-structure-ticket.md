# Ticket: Restructure Lakira Backend Tests by Type

## Summary

Create a first-class separation between unit and integration tests in the Lakira backend repo, align tooling (scripts + Jest config), and update docs/CI so each test type (static/unit/integration/contract) is explicitly represented.

## Background

- Current layout mixes unit and integration suites under `__tests__/`, making it difficult to run fast unit-only checks (see `test-structure-concern.md`).
- `docs/internal/archive/test-classification-2025-12-22.md` shows 27 suites are pure unit tests while only 7 hit the HTTP stack or DB.
- CI and `package.json` scripts still assume future multi-project Jest setup but are misconfigured (`--selectProjects` without matching config).

## Acceptance Criteria

- Unit suites live under `__tests__/unit/**`; integration suites live under `__tests__/integration/**` (API tests under `integration/api/**`, Swagger under `integration/docs/**`).
- `__tests__/integration/helpers/test-utils.ts` (or equivalent) stays aligned with integration suites, and imports consume it via clean paths.
- `package.json` scripts match the recommended block from `docs/internal/archive/test-tooling-recommendations-2025-12-22.md`, and `npm run test` executes unit + integration sequentially.
- `jest.config.mjs` uses multi-project configuration with dedicated setup files so `--selectProjects unit|integration` works; coverage is collected into `coverage/jest`.
- Documentation under `docs/internal/initiatives/tests-2-unit-tests`, `docs/internal/initiatives/tests-3-integration-tests`, and `docs/ci-cd/backend/**` references the new layout/scripts.
- CI pipeline runs static checks, `test:unit`, `test:integration`, and contract suites with green results and archived coverage artifacts.

## Out of Scope

- Adding entirely new test cases/features beyond restructuring/mirroring existing suites (Phase 2 optional expansions can follow-up).
- Changing contract/Newman tooling beyond updating docs to clarify how it relates to the new layout.
