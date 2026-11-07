# Postman/Newman Contract Guide

**Status:** Superseded — the suite this kit documents no longer exists
**Last updated:** 2026-08-31

> **Newman was retired on 2026-08-31.** The five collections, both runner scripts, both
> environment files, and the `newman` devDependency are gone; `tests/contract/postman-newman/`
> no longer exists. The unique assertions were migrated into `__tests__/integration/api/`
> (chiefly `analytics-caching.test.ts`), and Schemathesis remains the contract suite in
> `contract_local`. See `docs/internal/todos/2026-08-31-todo-retire-newman.md` for the
> decision and `docs/reference/ci-pipeline/workflow-guidelines.md` for current CI guidance.
>
> This kit is kept as the design record for a system that ran for months. Nothing in it
> describes the pipeline as it stands today — do not follow its commands.

This folder contains curated contract suites executed by Newman for deterministic API checks.

## What it validates

- endpoint availability + status codes
- response envelopes and key fields
- auth guard behavior
- analytics caching headers (`ETag`, `Cache-Control`) where expected

## Commands

```bash
npm run test:contract:local
npm run test:contract:staging
```

- Local script seeds fixtures by default and writes reports under `reports/local/<timestamp>/`.
- Staging script reads `STAGING_*` environment variables and writes reports under `reports/staging/<timestamp>/`.

## Required staging inputs

- `STAGING_BASE_URL`
- `STAGING_CONTRACT_TOKEN`
- seeded ID secrets (`STAGING_CATEGORY_*`, `STAGING_METRIC_*`, `STAGING_METRIC_SETTINGS_*`, `STAGING_METRIC_LOG_*`)

See `STAGING_RUNBOOK.md` for deploy-hook and rotation workflow.

## Maintenance Rules

- Keep collections aligned with `docs/reference/api/lakira-backend-openapi.json` and runtime behavior.
- Update assertions when endpoint contracts change.
- Keep reports upload paths stable for CI triage.

## Related Docs

- `PLAN.md`
- `CHECKLIST.md`
- `WORKFLOW_GUIDELINES.md`
- `PIPELINE_OVERVIEW.md`
- `STAGING_RUNBOOK.md`
