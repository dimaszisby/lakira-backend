# Contract Tests Plan

**Status:** Active (execution + hardening)
**Last updated:** 2026-04-13

## Goal

Provide a reliable contract gate that detects API drift before merge/deploy by combining curated Newman suites and Schemathesis generative checks.

## Current State Summary

- Local contract execution is implemented for Newman + Schemathesis.
- `contract_local` CI stage is implemented and used as merge gate baseline.
- Staging contract execution remains dependent on secret provisioning/rotation discipline.

## Phases

1. Foundation

- deterministic seed flow
- endpoint coverage baseline per domain
- runnable local scripts + report generation

2. Coverage hardening

- negative-path and validation scenarios
- cache/ETag assertions for analytics flows
- schema/response conformance tightening via Schemathesis

3. CI enforcement

- keep `contract_local` required
- maintain artifact upload + triage workflow
- complete staging run wiring and regular execution

4. Reliability improvements

- reduce flaky failures/noise
- tune runtime budgets
- optionally add scheduled deep fuzzing profiles

## Success Criteria

- FE-facing routes covered by contract suites with deterministic results.
- Contract gate blocks regressions in PR flow.
- Staging contract run becomes repeatable with documented secret rotation.
- Metrics/incidents are updated whenever major failures or improvements occur.

## Tracking Docs

- `contract-tests-checklist.md`
- `metrics-tracker.md`
- `incidents.md`
- `postman-newman/STAGING_RUNBOOK.md`
