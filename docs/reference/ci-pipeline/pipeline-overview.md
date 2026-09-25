# Lakira Backend – CI/CD Overview (GitHub Actions)

## 1. Purpose

This document provides an overview of the **Continuous Integration / Continuous Delivery (CI/CD)** pipeline for the Lakira Backend using **GitHub Actions**.

It describes:

- Which stages run on each push / pull request.
- How tests and contract checks are wired into the pipeline.
- How staging deployments and contract tests fit together.

For high-level project-wide strategy, see `docs/reference/ci-pipeline/strategy.md`.

For migrated non-blocking CI/contract follow-ups, see `docs/internal/initiatives/ci-pipeline/FOLLOW_UP_BACKLOG.md`.

---

## 2. Goals

- Ensure every backend change is:
  - Linted and type-checked,
  - Covered by unit and integration tests,
  - Validated via API contract tests (Schemathesis),
    before being considered stable.

- Provide a **repeatable pipeline definition** suitable for:
  - Recruiters and interviewers reviewing the repository.
  - AI agents (Codex) helping maintain or extend the pipeline.

- Keep the implementation **cost-aware and simple**, using:
  - GitHub Actions as primary CI engine.
  - Managed PaaS for staging deployments (Render) today; ADR-0042 (Accepted, not yet implemented)
    moves staging and production to a VPS running Docker Compose.

> Special Note for Codex: When modifying or generating workflow YAMLs for the backend, read this file and
> [`GITHUB_ACTIONS_PIPELINE_PLAN.md`](../../internal/initiatives/ci-pipeline/GITHUB_ACTIONS_PIPELINE_PLAN.md) first.
> The workflow file itself (`.github/workflows/backend-ci.yml`) is the source of truth.

---

## 3. Backend CI/CD Pipeline Shape

### 3.1 Triggers

The main backend workflow is triggered on:

- `push` to:
  - `main`
  - `dev`
  - `staging`
  - `feat/**`, `fix/**`, `chore/**`, `ci/**`, `docs/**`, `refactor/**` (and legacy `feature/**`)
- `pull_request` targeting:
  - `main`
  - `dev`
  - `staging`
- manual trigger via `workflow_dispatch`

### 3.2 Stages (Jobs)

The workflow (`name: Lakira Backend CI`) has these jobs:

1. **checks** – Lint, format check, OpenAPI consistency check, and typecheck
2. **security_delta** – Security framework tests, dependency delta check and gate evaluation. Runs in
   parallel with `checks`; a tripped gate fails the pipeline
3. **tests** (needs `checks` and `security_delta`) – Unit & Integration tests (with Postgres, Redis
   and RabbitMQ services)
   - Runs both fast test commands and coverage variants (`test:unit:coverage`, `test:integration:coverage`) and uploads `coverage/jest-unit` + `coverage/jest-integration` as artifacts.
4. **contract_local** (needs `tests`) – Schemathesis against a locally started backend
5. **deploy_staging** (needs `contract_local`) – Deploy backend to Render staging (`staging` branch only)
6. **smoke_staging** (needs `deploy_staging`) – Smoke suite against live staging (`staging` branch only)
7. **deploy_production** (needs `contract_local`) – Deploy to production (`main` branch only, behind
   the `production` environment's approval gate; no production service is provisioned yet)

Later, you may add:

- **e2e_backend** – Backend E2E/API flows.
- **performance** – Load tests against staging.

---

## 4. Key Workflows & Files

- **Workflow YAML (example):**
  - `.github/workflows/backend-ci.yml`

- **Supporting scripts (recommended):**
  - `tests/contract/schemathesis/scripts/run-local.js`
  - `scripts/run-contract-local-full.mjs`

- **Backend configuration for CI:**
  - `package.json` scripts:
    - `lint`
    - `typecheck`
    - `test:unit`
    - `test:integration`
    - `test:contract:schemathesis:local`
    - `seed:contract-tests`
    - `format:check`
    - `docs:openapi:check`
    - `build`
    - `start:test`

> Special Note for Codex: When normalizing `package.json` scripts, ensure they align with these names and that the workflow jobs call the same commands.

---

## 5. Environments & Secrets

The backend pipeline uses three logical environments:

1. **Local (developer)**
   - Runs via `npm run` commands directly.
   - Uses local Docker services for Postgres/Redis.
   - Runtime version: **Node.js 24.x (LTS)** — use `.nvmrc`, which CI reads through `node-version-file`.

2. **GitHub Actions (CI)**
   - Uses service containers for Postgres/Redis.
   - Uses secrets for DB credentials and JWT keys as needed.

3. **Staging (PaaS)**
   - Backend deployed on Render (managed platform).
   - Configured via platform environment variables.
   - The smoke suite points at this environment via `SMOKE_BASE_URL`.
   - Current staging API base URL: `https://lakira-backend-staging.onrender.com/api/v1`.

Detailed mapping (URLs, env vars, secrets) is maintained in:

- `docs/reference/environments.md`

### 5.1 Database Migrations in CI

- `npm run db:migrate:test` currently runs test migrations (`sequelize-cli db:migrate`) after ensuring build artifacts exist.
- Seeding for deterministic contract fixtures is handled separately by `npm run seed:contract-tests`, an explicit step in `contract_local` — Schemathesis reads both its token and its seeded IDs from `tmp/contract-seed.json`.
- `npm run start:test` should assume those migrations have already run.
- If migrations require extra flags (e.g. skipping data seeds), document them in `package.json` scripts before updating workflows.

> Special Note for Codex: Do not modify migration commands inside workflows without updating this subsection and the corresponding scripts.

### 5.2 FE-Consumable Backend Contract (Current)

FE convention: `API_URL` and `NEXT_PUBLIC_API_BASE_URL` must resolve to the same backend base URL per environment.

| FE target         | Backend API base URL to use                          | Status                                     |
| ----------------- | ---------------------------------------------------- | ------------------------------------------ |
| Local             | `http://localhost:5000/api/v1`                       | Active (`npm run dev`)                     |
| Preview / Staging | `https://lakira-backend-staging.onrender.com/api/v1` | Active                                     |
| Production        | `TBD`                                                | Production backend URL not provisioned yet |

See `docs/reference/environments.md` for the full secret/env mapping.

---

## 6. Relationship to Testing & Contract Docs

The backend CI pipeline is tightly coupled with:

- `docs/explanation/testing-strategy.md`
- `docs/reference/ci-pipeline/workflow-guidelines.md`
- `docs/internal/initiatives/tests-4-contract-tests/README.md`

CI jobs call the same scripts and commands referenced in those documents, ensuring that:

- The **theoretical testing strategy** is reflected in the **actual pipeline**.
- There is a single source of truth for each layer:
  - Testing strategy → `docs/explanation/testing-strategy.md`
  - CI/CD strategy → `docs/reference/ci-pipeline/`

---

## 7. Merge Requirements & Branch Protection

- The `contract_local` job is part of the default pipeline and must stay **green** before PR merges to `main`/`dev`/`staging`.
- Enforce this via GitHub branch protection rules:
  1. Open **Repository Settings → Branches → Branch protection rules**.
  2. Require status checks to pass before merging and add `contract_local` (job name) to the required checks list.
  3. Optionally add `checks` + `security_delta` + `tests` so lint/security/unit/integration stay enforced. `smoke_staging` runs after the deploy, so it cannot gate a merge. See `docs/reference/branch-protection.md` for what is actually configured.
- Document exceptions in PR descriptions and re-run the workflow rather than bypassing checks, since contract seeds + Schemathesis rely on deterministic fixtures to catch regressions early.
- When new jobs are added (e.g., a nightly Schemathesis run), update this section and the branch protection configuration accordingly.

> Special Note for Codex: If you modify job names or add/remove required checks, update this section plus `GITHUB_ACTIONS_PIPELINE_PLAN.md` so future contributors know which jobs gate merges.

---

## 8. Future Extensions

Planned/optional enhancements:

- **Jenkins experimental pipeline**:
  - Short-lived Jenkins setup documented in
    [`JENKINS_NOTES.md`](../../internal/archive/JENKINS_NOTES.md) (archived).
  - Mirrors the GitHub Actions pipeline stages for learning.

- **Staging hardening**:
  - Run Schemathesis against staging (`npm run test:contract:schemathesis:staging` exists; no CI job runs it).
  - Add stronger release gates for `staging` promotion flow.

- **Production rollout**:
  - Define production backend URL/domain (currently `TBD`).
  - `deploy_production` exists; the production target itself is pending ADR-0042's VPS.

---

## 9. Summary

- The Lakira Backend CI/CD is implemented primarily with **GitHub Actions**, following the strategy in [`strategy.md`](./strategy.md).
- Pipelines are designed to:
  - Run on every push/PR,
  - Enforce lint, typecheck, unit, integration, and contract tests,
  - Deploy to and validate against staging on the `staging` branch.
- The documentation in this `ci-pipeline/` folder ensures that anyone (including AI agents) can understand and safely modify the pipeline without guesswork.
