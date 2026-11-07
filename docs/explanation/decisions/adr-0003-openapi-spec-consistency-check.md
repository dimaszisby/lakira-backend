# ADR-0003 — OpenAPI Spec Consistency Check

- **Status:** Accepted
- **Date:** 2025-02-14
- **Origin:** `ADR-005` in the Static checks kit — [`tests-1-static-checks`](../../internal/initiatives/tests-1-static-checks/decisions.md)

---

## Context

The OpenAPI document under `docs/reference/api/lakira-backend-openapi.json` is generated from Zod schemas, but nothing prevented the spec from drifting out of sync with source changes.

## Decision

Introduce `npm run docs:openapi:check`, which regenerates the spec via `scripts/generate-openapi.ts` and fails (`git diff --exit-code`) if the tracked JSON changes. Add the same step to the CI `checks` job so pull requests cannot merge with stale specs.

## Consequences

Developers get an immediate failure when schemas change but the spec file hasn’t been committed, and CI guarantees published docs match the code. The command leaves diffs in working tree when updates are needed, making it obvious what to commit.

## Links

`package.json` scripts, `.github/workflows/backend-ci.yml`, `docs/internal/initiatives/tests-1-static-checks/static-checks-plan.md`.

## Cadence Notes

- **2025-04-01 (planned):** First quarterly static-check review (lint/typecheck/format/openapi KPIs). Outcomes will be logged in this section; cadence repeats on the first business day of each quarter.
