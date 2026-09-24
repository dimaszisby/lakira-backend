# Lakira Backend – Test Structure Concern & Proposal

**Author:** Dimas Hardini (+ GPT-5.1 Thinking)  
**Date:** 2025-12-19  
**Scope:** Lakira Backend (`express + typescript + sequelize + postgres`)

This document captures my current concerns about Lakira Backend test structure, plus a proposed direction for organizing tests by type (unit, integration, contract/E2E). The goal is for Codex (with repo access) to:

- Validate or correct assumptions made here.
- Fill gaps where my current context is incomplete.
- Propose concrete file-level changes aligned with the repo as it actually exists.

> **Update — 2025-12-22:** The initial restructuring is underway: `__tests__/unit/**` now contains all in-memory suites and `__tests__/integration/**` hosts the HTTP/API suites plus helpers. This document still describes the original pain points so we can track any regressions, but refer to `docs/internal/archive/test-classification-2025-12-22.md` and `docs/internal/archive/test-structure-move-plan-2025-12-22.md` for the current tree.  
> **Update — 2026-01-09:** The remaining analytics suites have been merged into `__tests__/unit/features/analytics/**`; references to the legacy `__tests__/analytics` folder remain here for historical context.

---

## 1. Problem Statement

Currently, all runtime tests live under `__tests__/` with a mix of:

- Domain/entity tests
- Application/use-case tests
- Infrastructure tests (HTTP, persistence)
- Feature-level API tests
- Swagger/OpenAPI tests

However:

- There is **no explicit separation by test type** (unit vs integration vs contract).
- It is not clear, from the folder/file alone, which tests hit the DB/HTTP vs which are pure in-memory.
- The existing test documentation under `docs/tests/**` talks about **static checks, unit, integration, contract**, but the code structure under `__tests__` does not reflect those categories.

This makes it hard to:

- Know which tests should be fast, isolated **unit tests**.
- Know which tests are **integration** and allowed to hit the DB / HTTP.
- Wire CI stages (`test:unit`, `test:integration`, `test:contract:*`) cleanly.
- Reason about coverage per feature and per test type.

---

## 2. Current Situation (as understood)

### 2.1 Test code layout

From `be-project-structure.md`, the current test tree is roughly:

```text
__tests__/
  analytics/
    dashboard-visualization.service.test.ts
    fallback-range.test.ts

  docs/
    swagger.test.ts

  features/
    analytics/
      application/GetDashboardVisualization.test.ts
      infrastructure/persistence/VisualizationReadRepoSequelize.test.ts

    auth/
      application/*.test.ts
      domain/AuthUser.test.ts
      infrastructure/http/controller.test.ts
      infrastructure/persistence/UserRepositorySequelize.test.ts

    metric/
      application/*.test.ts
      domain/Metric.test.ts
      infrastructure/http/controller.test.ts
      infrastructure/persistence/*.test.ts

    metric-category/
      application/GenerateDummyCategories.test.ts

    metric-log/
      application/*.test.ts
      domain/MetricLog.test.ts
      infrastructure/http/controller.test.ts
      infrastructure/persistence/MetricLogRepoSequelize.test.ts

    metric-settings/
      domain/MetricSettings.test.ts
      infrastructure/http/schema.zod.test.ts

  helpers/
    test-utils.ts

  analytics.test.ts
  auth.test.ts
  metric-category.test.ts
  metric-log.test.ts
  metric-settings.test.ts
  metric.test.ts
```

This structure is **feature- and layer-aware** (domain, application, infrastructure), but **not type-aware** (unit vs integration).

### 2.2 Test documentation layout

Under `docs/tests/` we already have conceptual test types:

- `1-static-checks/` – e.g. lint, typecheck
- `2-unit-tests/`
- `3-integration-tests/`
- `4-contract-tests/`
  - `postman-newman/` (collections + Newman runners)
  - future: schemathesis, etc.

There are also CI/CD docs under `docs/ci-cd/backend/**` that assume separate CI jobs / commands for:

- static checks
- unit tests
- integration tests
- contract tests (local + staging)

So **docs already distinguish test types**, but code layout does not.

---

## 3. Lakira Backend Test Type Definitions (Proposed)

These are the working definitions I intend to use for Lakira BE.

> Codex: please validate these definitions against the codebase and highlight any conflicts.

### 3.1 Static checks

- **What:** `eslint`, `tsc` (typecheck), maybe `prettier --check`.
- **Scope:** No runtime code execution beyond type analysis and linting.
- **CI job:** `checks` job (lint + typecheck).

### 3.2 Unit tests

- **Goal:** Validate the behavior of a _single unit_ of business logic in isolation, in memory.
- **Units:**
  - Domain entities/value objects (e.g. `AuthUser`, `Metric`, `MetricLog`, `MetricSettings`, etc.).
  - Application services/use-cases, **when all dependencies are faked/mocked** (e.g. fake `UserRepository`, fake `MetricRepo`, fake JWT provider).
  - Pure functions (helpers, calculation logic, analytics bucketing, etc.).
- **Constraints:**
  - No real DB connections or migrations.
  - No HTTP server / supertest calls.
  - No network calls to external services.
  - Deterministic and fast.
- **Examples in current tree (assumed):**
  - `__tests__/features/auth/domain/AuthUser.test.ts`
  - `__tests__/features/metric/domain/Metric.test.ts`
  - `__tests__/features/metric-log/domain/MetricLog.test.ts`
  - `__tests__/features/metric-settings/domain/MetricSettings.test.ts`
  - `__tests__/unit/features/analytics/domain/fallback-range.test.ts` (if pure; formerly `__tests__/analytics/fallback-range.test.ts`)
  - `__tests__/unit/features/analytics/application/GetDashboardVisualization.service.test.ts` (if pure; formerly `__tests__/analytics/dashboard-visualization.service.test.ts`)

### 3.3 Integration tests

- **Goal:** Validate how multiple layers collaborate (Express + middleware + controller + service + repo + DB, or service + real DB, or Swagger/OpenAPI setup).
- **Scope examples:**
  - Application/use-case tests that use **real Sequelize repositories** and a test DB.
  - Repository tests that validate SQL/ORM mappings with a test DB.
  - HTTP/controller tests using Express app + supertest, hitting full request pipeline and DB.
  - Swagger/OpenAPI tests that validate docs vs routes.
- **Allowed:**
  - Real Postgres (test DB).
  - Real Redis (if used).
  - Real Express app in test mode.
- **Examples in current tree (assumed):**
  - `__tests__/features/auth/application/*.test.ts`
  - `__tests__/features/auth/infrastructure/http/controller.test.ts`
  - `__tests__/features/auth/infrastructure/persistence/UserRepositorySequelize.test.ts`
  - `__tests__/features/metric/application/*.test.ts`
  - `__tests__/features/metric/infrastructure/http/controller.test.ts`
  - `__tests__/features/metric/infrastructure/persistence/*.test.ts`
  - `__tests__/features/metric-log/application/*.test.ts`
  - `__tests__/features/metric-log/infrastructure/http/controller.test.ts`
  - `__tests__/features/metric-log/infrastructure/persistence/MetricLogRepoSequelize.test.ts`
  - `__tests__/features/analytics/infrastructure/persistence/VisualizationReadRepoSequelize.test.ts`
  - `__tests__/features/metric-settings/infrastructure/http/schema.zod.test.ts`
  - `__tests__/docs/swagger.test.ts`
  - Root feature tests: `analytics.test.ts`, `auth.test.ts`, `metric.test.ts`, `metric-category.test.ts`, `metric-log.test.ts`, `metric-settings.test.ts`

### 3.4 Contract / E2E tests

- **Goal:** Validate that the **public HTTP API** matches an expected contract:
  - Request/response schemas.
  - Status codes.
  - Error envelopes.
- **Primary tooling:**
  - Postman collections + Newman (current approach).
  - Future: schemathesis, OpenAPI-based fuzzing, etc.
- **Scope:**
  - Hit a running instance (local or staging) via HTTP.
  - Treat the system as a black box (no direct DB access).
- **Location (current):**
  - `docs/internal/initiatives/tests-4-contract-tests/postman-newman/**`

---

## 4. Proposed Test Structure and Conventions (Code)

### 4.1 Foldering strategy (recommended “for now”)

To minimize disruption and keep things simple, I propose:

```text
__tests__/
  unit/
    features/
      auth/
        domain/
          AuthUser.test.ts
      metric/
        domain/
          Metric.test.ts
      metric-log/
        domain/
          MetricLog.test.ts
      metric-settings/
        domain/
          MetricSettings.test.ts
      analytics/
        dashboard-visualization.service.test.ts
        fallback-range.test.ts
    shared/
      # any pure helpers test for shared logic

  integration/
    features/
      auth/
        application/*.test.ts
        infrastructure/http/controller.test.ts
        infrastructure/persistence/UserRepositorySequelize.test.ts
      metric/
        application/*.test.ts
        infrastructure/http/controller.test.ts
        infrastructure/persistence/*.test.ts
      metric-category/
        application/GenerateDummyCategories.test.ts
      metric-log/
        application/*.test.ts
        infrastructure/http/controller.test.ts
        infrastructure/persistence/MetricLogRepoSequelize.test.ts
      metric-settings/
        domain/MetricSettings.test.ts              # only here if it uses DB/HTTP
        infrastructure/http/schema.zod.test.ts
      analytics/
        application/GetDashboardVisualization.test.ts
        infrastructure/persistence/VisualizationReadRepoSequelize.test.ts

    docs/
      swagger.test.ts

    api/
      analytics.test.ts
      auth.test.ts
      metric.test.ts
      metric-category.test.ts
      metric-log.test.ts
      metric-settings.test.ts

helpers/
  test-utils.ts   # optionally moved to test-support/ in future
```

Key points:

- **Unit tests**
  - Under `__tests__/unit/**`.
  - Only pure domain/services with fakes, no DB/HTTP.
- **Integration tests**
  - Under `__tests__/integration/**`.
  - Anything that hits DB/HTTP/Express/Sequelize.
- **Contract tests**
  - Remain in `docs/internal/initiatives/tests-4-contract-tests/postman-newman/**`.
  - Optionally, we might add Jest “wrappers” under `__tests__/contract/**` later, but not required now.

> Codex: please propose the exact before/after move list for each existing test file.

### 4.2 Naming conventions

To make test type clear from the filename:

- **Unit tests:** `*.unit.test.ts` or just `*.test.ts` **inside `unit/`**.
- **Integration tests:** `*.integration.test.ts` or just `*.test.ts` **inside `integration/`**.
- **(Optional) Contract wrappers:** `*.contract.test.ts` if we add Jest wrappers.

For now, I am okay with using **directory** as the primary discriminator:

- `__tests__/unit/**` → unit
- `__tests__/integration/**` → integration

Suffixes can be phased in later if Codex thinks it is worth the extra signal.

### 4.3 Package.json scripts (expected)

Target scripts:

```jsonc
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",

    "test": "npm run test:unit && npm run test:integration",

    "test:unit": "jest --runInBand --testPathPattern='__tests__/unit/'",
    "test:integration": "jest --runInBand --testPathPattern='__tests__/integration/'",

    "test:contract:local": "node docs/internal/initiatives/tests-4-contract-tests/postman-newman/scripts/run-contract-local.js",
    "test:contract:staging": "node docs/internal/initiatives/tests-4-contract-tests/postman-newman/scripts/run-contract-staging.js",
  },
}
```

> Codex:
>
> - Please check if these scripts already exist and match this intent.
> - If not, propose the exact script values needed given the current Jest/Vitest setup.

### 4.4 Jest configuration (high-level expectation)

At a high level, I expect:

- `collectCoverageFrom` to include `src/**/*.ts` but exclude:
  - migrations
  - config files
  - test utilities
- `coverageDirectory` somewhere under `reports/jest/` or similar.
- Optional `coverageThreshold` (global and/or per-feature).

> Codex:
>
> - Please generate or adjust `jest.config.*` so that:
>   - `npm run test:unit` only runs unit tests.
>   - `npm run test:integration` only runs integration tests.
>   - Coverage is collected appropriately and can be uploaded in CI.

---

## 5. Incremental Migration Plan (High-Level)

I want this refactor to be incremental, not a big-bang.

### Step 0 – Confirm definitions & constraints

- Lock in the definitions in Section 3 with Codex feedback.
- Confirm which testing framework(s) are currently used (Jest / Vitest) and how they are configured.

### Step 1 – Classify existing tests

For each test file under `__tests__/`:

- Decide if it is **unit** or **integration**, based on:
  - Does it hit Sequelize / DB?
  - Does it hit Express / HTTP?
  - Does it require env vars / secrets beyond simple config?
- Produce a small table or JSON mapping:

  ```text
  __tests__/features/auth/domain/AuthUser.test.ts → unit
  __tests__/features/auth/application/LoginUser.test.ts → integration (uses real repo/db?)
  ...
  ```

### Step 2 – Create `unit/` and `integration/` directories & move the obvious ones

- Create `__tests__/unit/` and `__tests__/integration/`.
- Move **obvious domain-only tests** into `__tests__/unit/features/...`.
- Move clearly integration tests (repos, HTTP, swagger, root feature tests) into `__tests__/integration/...`.

### Step 3 – Tighten application tests

- For application tests that currently use real repositories/DB:
  - Decide whether to keep them as **integration** tests, or
  - Split them into:
    - unit test (with fake repos), and
    - integration test (with real repo + DB).

This is optional for now; the minimum is to classify them correctly.

### Step 4 – Update documentation

- Update `docs/internal/initiatives/tests-2-unit-tests/*` and `docs/internal/initiatives/tests-3-integration-tests/*` to:
  - Describe the actual directory layout and scripts (`test:unit`, `test:integration`).
  - Document what is allowed (DB/HTTP or not).
- Optionally create a **Test Coverage Matrix** doc:

  ```markdown
  | Feature         | Unit (domain/app) | Integration (HTTP/DB) | Contract | Status   |
  | --------------- | ----------------- | --------------------- | -------- | -------- |
  | Auth            | PASS              | PASS                  | PASS     | Stable   |
  | Metric          | PASS              | PASS                  | PASS     | Stable   |
  | Metric Log      | PASS              | In progress           | PASS     | In Prog. |
  | Metric Settings | PASS              | In progress           | PASS     | In Prog. |
  | Analytics       | PASS              | PASS                  | PASS     | Stable   |
  ```

### Step 5 – Align CI

- Confirm that backend CI (`backend-ci.yml`) jobs match:
  - `checks` → lint + typecheck.
  - `tests` → `npm run test:unit` + `npm run test:integration`.
  - `contract_local` / `contract_staging` → Newman scripts.
- Ensure job names and scripts align with this document and the `docs/ci-cd/backend/**` docs.

---

## 6. Questions & TODOs for Codex

> Codex: please answer/perform as many of these as possible, based on the actual codebase.

1. **Validation of test type definitions**
   - Do the definitions in Section 3 align with how tests are currently written?
   - Are there any tests that violate these assumptions (e.g. a domain test unexpectedly hitting DB)?

2. **Per-file classification**
   - For each test file under `__tests__/`, classify as **unit** or **integration**, based on real dependencies.
   - Output this as:
     - A markdown table in a new doc, or
     - A JSON file, or
     - Updated comments at the top of each test file (e.g. `// Test Type: UNIT`).

3. **Folder move plan**
   - Given the classification, propose a **concrete move plan**:
     - From → To paths for each test file (e.g., `__tests__/features/auth/domain/AuthUser.test.ts` → `__tests__/unit/features/auth/domain/AuthUser.test.ts`).
   - If any move is risky (e.g. due to relative imports), call that out and propose fixes.

4. **Tooling & config**
   - Inspect `package.json`, Jest/Vitest config, and current CI workflows.
   - Propose exact script values and config changes to support:
     - `npm run test:unit` (unit only).
     - `npm run test:integration` (integration only).
     - `npm run test:contract:*` (existing Newman scripts).

5. **Coverage & reports**
   - Check if coverage is currently collected.
   - If not, propose:
     - `collectCoverageFrom`, `coverageDirectory`, and `coverageThreshold` values.
     - Minimal CI changes to archive coverage reports as artifacts.

6. **Test helper layout**
   - Evaluate `__tests__/integration/helpers/test-utils.ts`.
   - Suggest whether we should:
     - Keep it there,
     - Move it to a top-level `test-support/` folder,
     - Or split it into unit-only vs integration-only helpers.

7. **Missing tests & gaps**
   - Based on the feature tree (`src/features/**`), highlight:
     - Features with **no unit tests**.
     - Features with **no integration tests**.
     - Any obvious “holes” vs the designed architecture (e.g. metric-settings application tests missing).

---

## 7. Notes

- The goal of this document is to define **direction and intent**, not to enforce a final structure.
- I expect Codex to refine this plan to match the reality of the repo and produce a concrete checklist / diff plan.
- After Codex’s feedback, I will:
  - Update this document and the docs under `docs/tests/**`.
  - Start executing the migration (moving/renaming tests, updating configs, CI, etc.).
