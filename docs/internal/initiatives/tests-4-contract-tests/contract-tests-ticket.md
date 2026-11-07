# Ticket: Stand Up Contract Tests (Postman + Schemathesis)

## Summary

Deliver a production-ready contract-testing layer for Lakira Backend that covers all frontend-facing APIs via Postman/Newman suites plus Schemathesis-based fuzzing, and integrate those checks into the CI/CD pipeline so regressions block merges and staging deploys.

## Background

- Integration tests reached Phase 3 maturity (doc kit + Redis coverage) and now serve as the foundation for system-level stability.
- CI/CD roadmap (`docs/internal/initiatives/ci-pipeline/GITHUB_ACTIONS_PIPELINE_PLAN.md`) explicitly sequences contract tests after integration tests.
- Existing contract-test docs (Postman README/PLAN/CHECKLIST) define desired coverage, but no executable suites, scripts, or CI jobs exist yet.
- Schemathesis folder is empty, so there is no automated spec-fuzzing to catch schema drift.

## Acceptance Criteria

- Postman collections + environment files contain concrete requests/tests for every endpoint listed in the checklist (analytics, metrics, logs, settings, auth).
- Deterministic seed script (`npm run seed:contract-tests`) resets contract data and exports IDs/tokens for environment consumption.
- Local + staging Newman scripts (`npm run test:contract:local`, `npm run test:contract:staging`) execute all collections, assert headers/schema, and upload reports.
- Schemathesis CLI scripts run against local + staging base URLs using the checked-in OpenAPI file, with documented workflow + checklist.
- GitHub Actions pipeline includes `contract_local`, `deploy_staging`, and `contract_staging` jobs as described in the CI plan, and PRs cannot merge without `contract_local` success.
- Metrics tracker captures runtime, pass/fail counts, and endpoint coverage for both Newman and Schemathesis runs.
- README/plan/checklist/ticket/decisions/incidents remain up to date and cross-link supporting docs (Postman + Schemathesis folders, CI plan).

## Out of Scope

- Frontend E2E automation (handled in FE repo).
- Performance/load testing (tracked separately).
- End-user documentation of the APIs; this initiative focuses on enforcement.

## Dependencies / Stakeholders

- **Backend Platform** (owner of scripts, seeds, and API behaviour).
- **Frontend engineering** (consumers; confirm payload expectations and review breaking changes).
- **DevOps / CI** (implements GitHub Actions jobs, handles secrets).
- **QA / Product** (review contract coverage vs. business-critical scenarios).

Blocking dependencies:

- Regenerated OpenAPI spec via `npm run docs:openapi:generate`.
- Stable seed data for analytics/metrics/logs to avoid flaky IDs.

## Recent Progress

- 2026-01-14 — Schemathesis CLI + runner scripts landed and the first local fuzzing run executed against `http://localhost:8002/api/v1`. Results: 31/31 operations exercised, 112 failures (schema drift vs. OpenAPI envelopes, lack of 405 handlers for TRACE, and global rate limiting returning 429). Artifacts live under `docs/internal/initiatives/tests-4-contract-tests/schemathesis/reports/local/2026-01-14T08-19-10-426Z/`; follow-ups captured in `metrics-tracker.md` and `incidents.md`.
- 2026-01-14 — Introduced `DISABLE_RATE_LIMITING=true` env toggle (documented in README + Schemathesis guide) so contract tests can bypass throttling noise without affecting other environments.
- 2026-01-14 — Re-ran Schemathesis locally with limiter disabled and reduced phases (`examples,coverage`) to focus on schema/method drift. 31/31 endpoints still covered, 43 failures remain (no 429s). Findings logged under `schemathesis/findings.md` with next steps (405 fallback, response envelope alignment, seeded IDs for test data).
- 2026-01-15 — Documented expected `400`/`404` responses in the OpenAPI generator for cursor + stats endpoints so Schemathesis treats validation errors (empty search terms, missing metric IDs) and not-found scenarios as compliant instead of failures.
- 2026-01-15 — Updated `.github/workflows/backend-ci.yml` so `contract_local` regenerates OpenAPI, seeds fixtures, runs Newman + Schemathesis sequentially, and uploads `newman-contract-local` / `schemathesis-contract-local` artifacts. Docs (plan, checklist, pipeline overview) now reflect the CI behaviour; staging wiring + secret rotation remain as the next checklist items.
- 2026-01-15 — Added a staging-secret matrix + rotation playbook (`docs/internal/initiatives/tests-4-contract-tests/README.md` and `docs/internal/initiatives/ci-pipeline/GITHUB_ACTIONS_PIPELINE_PLAN.md`) covering `STAGING_*` fixture IDs and Schemathesis tokens so DevOps can inject/rotate secrets before enabling staging contract runs.
- 2026-01-15 — Documented merge-gate expectations: `docs/reference/ci-pipeline/pipeline-overview.md` now includes branch protection steps to require the `contract_local` job, and the contract README references the same requirement so reviewers know merges must wait for a green contract suite.
- 2026-01-15 — Authored `docs/internal/initiatives/tests-4-contract-tests/postman-newman/STAGING_RUNBOOK.md`, detailing Render deploy-hook prerequisites, CI flow, manual reproduction steps, and secret rotation so the first `contract_staging` run can be executed predictably.
- 2026-01-15 — Enabled GitHub branch ruleset “Protect main & develop (contract gate)” requiring the `contract_local` job; updates logged in plan/checklist/metrics so auditors can see enforcement is active.
