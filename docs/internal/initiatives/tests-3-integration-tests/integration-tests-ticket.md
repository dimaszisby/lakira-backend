# Ticket: Stand Up Portfolio-Grade Integration Tests

## Summary

Document, harden, and extend the Lakira backend integration test stage so it reliably validates HTTP + database flows, mirrors CI expectations, and showcases a production-grade approach for recruiters/reviewers.

## Background

- The test-structure overhaul split suites into `__tests__/unit/**` and `__tests__/integration/**`, but only the unit side had a full documentation kit (README/plan/checklist/ticket/metrics/ADRs).
- GitHub Actions already runs `npm run test:integration` and `npm run test:integration:coverage` after unit tests, yet there was no single source describing environment needs, helper usage, or roadmap for deeper scenarios.
- CI/CD docs (`docs/ci-cd/backend/**`) call for integration tests to gate every PR before contract suites; this ticket tracks the work required to make that stage demonstrably ready.

## Acceptance Criteria

- README, plan, checklist, ticket, decision log, incidents log, and metrics tracker exist under `docs/internal/initiatives/tests-3-integration-tests/` and reflect the latest helper/layout/command expectations.
- Environment prerequisites (Docker services, migrations, env vars, `SKIP_DB_LIFECYCLE` usage) are documented, with a reproducible command chain for local developers.
- Coverage backlog and scenario roadmap are captured in the checklist + plan (journey suites, Redis toggle, analytics fixtures).
- Metrics tracker contains baseline + target entries for runtime, coverage, and scenario counts, and CI artifact expectations are linked.
- Decisions about infra (Redis opt-in, truncation strategy, coverage thresholds) live in `decisions.md`, with future incidents recorded via the provided template.

## Status (2026-01-13)

- Phase 2 checklist items landed: onboarding journey suite, duplicate timestamp HTTP regressions (now 409), Redis cache integration suites, reusable dashboard fixtures, and documentation/trackers updated with metrics plus helper references.
- Phase 3 observability goals are complete: integration-specific coverage thresholds now enforce ≥70/45/70/70, CI emits `coverage/junit/integration.xml`, flake-handling guidance lives in `incidents.md`, and quarterly KPI reviews are scheduled (first work week of Mar/Jun/Sep/Dec).
- Redis-dependent suites remain opt-in via `ENABLE_REDIS_INTEGRATION` to keep default `npm run test:integration` fast while providing cache coverage when infra is available.
- Upcoming Phase 4 (Redis nightly CI coverage) is planned but **blocked until the contract test kit under `docs/internal/initiatives/tests-4-contract-tests/**`ships**; once that milestone lands we’ll add an overnight GitHub Actions job that exports`ENABLE_REDIS_INTEGRATION=true`, captures artifacts, and tracks performance in `metrics-tracker.md`.

## Out of Scope

- Writing every remaining integration test in one shot (tracked individually via checklist items).
- Contract tests, staging deploys, or front-end automation.
- CI platform changes beyond documenting/uploading the necessary artifacts for integration suites.

## Dependencies / Stakeholders

- Dependent docs: `docs/internal/initiatives/tests-overhaul/**`, `docs/internal/archive/test-classification-2025-12-22.md`, `.github/workflows/backend-ci.yml`, `docs/ci-cd/backend/**`.
- Stakeholders: backend owner (@dimaspramudya), Codex (documentation + automation support), reviewers who rely on artifacts for CI/CD compliance, portfolio reviewers/interviewers expecting environment-ready integration coverage.
