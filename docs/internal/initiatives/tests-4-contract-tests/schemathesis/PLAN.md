# Schemathesis Plan

**Status:** Active
**Last updated:** 2026-04-13

## Goal

Use generative OpenAPI-driven testing to catch schema/status drift and unexpected server errors that curated suites may miss.

## Coverage Focus

- FE-facing API tags and endpoints in `docs/reference/api/lakira-backend-openapi.json`.
- Positive deterministic profiles for merge confidence.
- Optional deeper exploratory profiles for non-blocking investigation.

## Execution Priorities

1. Keep local quick/gate flows stable for regular development.
2. Keep full profile available for deeper release confidence.
3. Keep staging profile operational when secrets and runtime budgets allow.

## Success Criteria

- High path coverage with reproducible failures.
- Runtime remains within practical CI/local budgets.
- Findings are triaged and reflected back into API code/spec/tests.

## Tracking

- `CHECKLIST.md`
- `findings.md`
- `../metrics-tracker.md`
- `../incidents.md`
