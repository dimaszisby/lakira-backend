# Ticket: Elevate Backend Unit Tests to Portfolio-Grade Gate

## Summary

Document, harden, and measure the backend unit-test stage so it functions as the second layer of the Lakira testing pyramid (after static checks and before integration/contract tests), satisfying CI/CD requirements and interview-ready documentation standards.

## Background

- The test-structure overhaul split suites into `__tests__/unit/**` and `__tests__/integration/**`, but the unit side lacked plans, KPIs, and workflow guidance.
- GitHub Actions already runs `npm run test:unit`/`:coverage`, yet reviewers had no canonical reference describing expectations or coverage strategy.
- CI/CD docs (`docs/ci-cd/backend/**`) call for unit tests to guard every PR before integration or contract jobs run; this ticket closes the documentation/process gap.

## Acceptance Criteria

- README + workflow guidelines + plan + checklist + ticket + metrics + decision log + incident log exist under `docs/internal/initiatives/tests-2-unit-tests/` and describe scope, commands, KPIs, and governance.
- Baseline runtime and coverage metrics recorded; coverage gaps enumerated with owners/priorities.
- Workflow guidance explains when/where to add suites, how to mock dependencies, and how to document changes.
- CI documentation references the same commands/artifact flow (no divergence between docs and `.github/workflows/backend-ci.yml`).

## Out of Scope

- Writing new unit tests for every uncovered module (tracked via checklist but not delivered in this doc-only ticket).
- Integration or contract suite changes.
- CI platform migrations or new infrastructure outside unit-test coverage/observability.

## Dependencies / Stakeholders

- Dependent docs: `docs/internal/initiatives/tests-overhaul/**`, `docs/ci-cd/backend/**`, `docs/internal/initiatives/tests-1-static-checks/**`.
- Stakeholders: backend owner (@dimaspramudya), Codex (documentation + automation), reviewers who rely on artifacts for interviews/portfolio review.
