# Ticket: Establish Static Checks as First-Class Gate

## Summary

Document, enhance, and automate the static analysis stage (ESLint, TypeScript, formatting, schema validation) so every commit is validated before unit/integration tests, aligning with the newly overhauled test structure.

## Background

- The repository already includes `npm run lint` and `npm run typecheck` scripts but lacks documentation, formatting enforcement, and CI guarantees.
- The test restructuring created clear folders for unit/integration suites; this ticket closes the loop by treating static checks as Phase 1 in the testing pyramid.
- Past guidance (`docs/internal/initiatives/tests-overhaul/test-structure-plan.md`) called out static checks as the next investment area post-overhaul.

## Acceptance Criteria

- README + plan + checklist published in `docs/internal/initiatives/tests-1-static-checks/` describing commands, scope, and milestones.
- Prettier (format check/write) scripts exist, are documented, and run locally/CI.
- Backend CI pipeline runs lint + typecheck + format check as a distinct stage ahead of tests and fails fast on errors.
- Metrics tracker reflects baseline and improved runtimes; decisions/ADR log contains tooling choices.

## Out of Scope

- Implementing new lint rules unrelated to static-stage enablement (can be separate tickets).
- Contract/unit/integration test changes beyond referencing the static stage.
- CI platform migrations (GitHub→other) outside of wiring existing workflows.

## Dependencies / Stakeholders

- Dependent docs: `docs/internal/initiatives/tests-overhaul/`, `docs/ci-cd/backend/**`.
- Stakeholder: Backend owner (@dimaspramudya); reviewers/future contributors rely on this documentation to understand pre-test gates.
