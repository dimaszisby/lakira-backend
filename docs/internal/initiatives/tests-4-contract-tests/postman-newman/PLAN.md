# Postman/Newman Plan

**Status:** Superseded — Newman was retired in #75 (`a4635f3`); see this folder's `README.md`
**Last updated:** 2026-04-13

## Goal

Maintain deterministic contract suites for FE-facing APIs, covering both happy-path and critical negative-path behavior.

## Coverage Targets

- Domains: `auth`, `metric-categories`, `metrics`, `metric-settings`, `metric-logs`, `analytics`
- For each critical endpoint:
  - success status and required payload fields
  - auth/validation/not-found guardrails where applicable
  - analytics header behavior (`ETag`, `Cache-Control`) where applicable

## Execution Targets

- Local runtime: <= 10 minutes
- Staging runtime: <= 12 minutes
- Report output per run (CLI + HTML/JUnit) under `reports/<env>/<timestamp>/`

## Near-term Priorities

1. Keep collection assertions synchronized with OpenAPI + runtime behavior.
2. Close any endpoint/scenario gaps found by Schemathesis findings.
3. Keep staging secret rotation and runbook execution current.

## Tracking

- Progress and open tasks: `CHECKLIST.md`
- Runtime and coverage KPIs: `../metrics-tracker.md`
- Operational incidents: `../incidents.md`
