# Lakira Backend – GitHub Actions Pipeline Checklist

Use this checklist when:

- Setting up the backend pipeline for the first time.
- Making significant CI/CD changes.
- Reviewing the pipeline as part of a release or refactor.

---

## 1. Workflow Files & Docs

- [ ] Backend workflow exists at `.github/workflows/backend-ci.yml`.
- [ ] Workflow name is clear (e.g. `backend-ci`).
- [ ] Workflow is documented in:
  - [ ] `docs/reference/ci-pipeline/pipeline-overview.md`
  - [ ] `docs/internal/initiatives/ci-pipeline/GITHUB_ACTIONS_PIPELINE_PLAN.md`
  - [ ] `docs/reference/ci-pipeline/workflow-guidelines.md`

> Special Note for Codex: When adding or renaming backend workflows, ensure they are referenced in these docs.

---

## 2. Triggers, Branches & Concurrency

- [ ] Workflow triggers on:
  - [ ] `push` to `main`, `dev`, `staging`, and `feature/**`.
  - [ ] `pull_request` targeting `main`, `dev`, and `staging`.
  - [ ] `workflow_dispatch` exists for manual runs.
- [ ] Branch protections require `backend-ci` to pass before merging into `main`.
- [ ] Workflow uses `concurrency` to cancel in-progress runs on the same branch:
  - [ ] `concurrency.group` includes the branch/ref.
  - [ ] `concurrency.cancel-in-progress` is set to `true`.

> Special Note for Codex: Do not remove or relax these triggers/concurrency blocks unless the root documents are updated in the same change.

---

## 3. Job Structure & Timeouts

- [ ] `checks` job exists and runs:
  - [ ] `npm ci`
  - [ ] `npm run lint`
  - [ ] `npm run format:check`
  - [ ] `npm run typecheck`
  - [ ] `npm run docs:openapi:check`
  - [ ] Job has `timeout-minutes` configured.

- [ ] `tests` job exists and:
  - [ ] Declares Postgres and Redis service containers.
  - [ ] Runs `npm ci`.
  - [ ] Runs `npm run build`.
  - [ ] Runs `npm run db:migrate:test` (or equivalent).
  - [ ] Runs `npm run test:unit`.
  - [ ] Runs `npm run test:integration`.
  - [ ] Runs `npm run test:unit:coverage` and stores the output (e.g., renames `coverage/jest` to `coverage/jest-unit`).
  - [ ] Runs `npm run test:integration:coverage` and stores the output (e.g., renames `coverage/jest` to `coverage/jest-integration`).
  - [ ] Uploads the combined coverage folders as a GitHub Actions artifact.
  - [ ] Depends on `checks` (`needs: checks`).
  - [ ] Has `timeout-minutes` configured.

- [ ] `contract_local` job exists and:
  - [ ] Declares Postgres and Redis service containers.
  - [ ] Runs `npm ci`.
  - [ ] Runs `npm run build` before starting the backend so `dist/server.js` exists.
  - [ ] Runs DB migrations for contract DB (can reuse `db:migrate:test`).
  - [ ] Starts backend with `npm run start:test` in background via `nohup`, writes the PID to `/tmp/backend.pid`, and captures logs at `/tmp/backend.log`.
  - [ ] Waits for the TCP port (`tcp:4000`) and the HTTP health endpoint (`/api/v1/health`) using the pinned `wait-on` devDependency, dumping the log tail whenever either probe fails.
  - [ ] Runs `npm run test:contract:local`.
  - [ ] Tails `/tmp/backend.log` automatically when the job fails (helpful for debugging).
  - [ ] Uploads Newman local reports as artifacts.
  - [ ] Depends on `tests` (`needs: tests`).
  - [ ] Has `timeout-minutes` configured.

- [ ] `deploy_staging` job exists and:
  - [ ] Depends on `contract_local`.
  - [ ] Runs only on `refs/heads/staging`.
  - [ ] Triggers Render staging deploy via deploy hook.
  - [ ] Polls staging health endpoint until healthy or timeout.
  - [ ] Fails pipeline if staging does not become healthy.

- [ ] `contract_staging` job exists and:
  - [ ] Depends on `deploy_staging`.
  - [ ] Runs only on `refs/heads/staging`.
  - [ ] Runs `npm run test:contract:staging`.
  - [ ] Uploads Newman staging reports as artifacts.
  - [ ] Has `timeout-minutes` configured.

> Special Note for Codex: When editing `.github/workflows/backend-ci.yml`, treat these checklist bullets as requirements—skip automation if any listed command/script is missing or renamed.

---

## 4. Services & Environment Variables

- [ ] Postgres service configured with:
  - [ ] `POSTGRES_USER=postgres`
  - [ ] `POSTGRES_PASSWORD=${{ secrets.POSTGRES_PASSWORD_TEST }}`
  - [ ] `POSTGRES_DB=lakira_ci`
  - [ ] Health checks (`pg_isready`).

- [ ] Redis service configured with health checks.

- [ ] Jobs that talk to DB/Redis set:
  - [ ] `DATABASE_URL` points to the Postgres service exposed on `localhost:5432` (GitHub Actions forwards service ports to the runner host).
  - [ ] `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` are exported when tools (e.g., `sequelize-cli`) require discrete values. When `DATABASE_URL` is present, the env manager will derive these automatically at runtime.
  - [ ] `REDIS_URL` uses the Redis service exposed on `localhost:6379`.
  - [ ] `NODE_ENV=test` for tests/contract jobs.
  - [ ] `JWT_SECRET` is populated from `secrets.JWT_SECRET_TEST`.

- [ ] FE-facing backend env contract is documented and consistent with `ENVIRONMENTS_MATRIX.md`:
  - [ ] FE `API_URL` and `NEXT_PUBLIC_API_BASE_URL` are equal per environment.
  - [ ] Staging value is `https://lakira-backend-staging.onrender.com/api/v1`.
  - [ ] Production value remains `TBD` until a production backend URL exists.

- [ ] Staging deploy job reads:
  - [ ] `RENDER_STAGING_DEPLOY_HOOK_URL` from secrets.
  - [ ] `STAGING_HEALTH_URL` from secrets.

- [ ] Staging contract job reads:
  - [ ] `STAGING_BASE_URL` from secrets or env.

> Special Note for Codex: Never invent new env var names or service hostnames in workflows; use the ones specified here and in `ENVIRONMENTS_MATRIX.md`.

---

## 5. `package.json` Scripts

Backend `package.json` includes:

- [ ] `"lint": "…"` – ESLint.
- [ ] `"typecheck": "tsc --noEmit"` (or equivalent).
- [ ] `"test:unit": "…"`.
- [ ] `"test:integration": "…"`.
- [ ] `"test:contract:local": "node tests/contract/postman-newman/scripts/run-contract-local.js"` (or equivalent).
- [ ] `"test:contract:staging": "node tests/contract/postman-newman/scripts/run-contract-staging.js"`.
- [ ] `"db:migrate:test": "…"`.
- [ ] `"start:test": "…"`.
- [ ] `"format:check": "…"`.
- [ ] `"docs:openapi:check": "…"`.
- [ ] `"build": "tsc -p tsconfig.build.json"` (or equivalent).

> Special Note for Codex: Confirm these scripts exist before wiring them into workflows; if any are missing, update `package.json` and this doc together.

---

## 6. Caching & Performance

- [ ] `actions/setup-node@v4` is used with:
  - [ ] `node-version: 20`.
  - [ ] `cache: npm` enabled.
- [ ] Jobs use `npm ci` instead of `npm install`.
- [ ] No unnecessary duplicate `npm ci` steps in the same job.

> Special Note for Codex: Always prefer cached installs in generated workflows—only fall back if the cache strategy conflicts with these bullets.

---

## 7. Contract Test Integration

- [ ] `docs/internal/initiatives/tests-4-contract-tests/postman-newman/PLAN.md` and `PIPELINE_OVERVIEW.md` describe CI usage (local + staging).
- [ ] Newman installed via:
  - [ ] DevDependency (preferred), or
  - [ ] CI install step.
- [ ] `test:contract:local` uses:
  - [ ] `lakira-local.postman_environment.json`.
  - [ ] All relevant collections.
- [ ] `test:contract:staging` uses:
  - [ ] `lakira-staging.postman_environment.json`.
- [ ] Contract runs produce:
  - [ ] JUnit XML reports.
  - [ ] HTML reports.
  - [ ] Saved under `tests/contract/postman-newman/reports/local/**` and `reports/staging/**`.

- [ ] GitHub Actions uploads:
  - [ ] Local contract reports as artifacts.
  - [ ] Staging contract reports as artifacts.

> Special Note for Codex: Do not drop artifact upload steps when editing workflows; they are required for interview-ready evidence.

---

## 8. Security & Compliance Gates (Backend CI)

- [ ] GitHub **Dependabot** is enabled for npm.
- [ ] GitHub **secret scanning** is enabled.
- [ ] (Optional / Recommended) A **CodeQL** workflow exists for SAST.
- [ ] (Optional) A “security” job runs `npm audit --audit-level=high` and fails on high/critical issues.
- [ ] No secrets are hard-coded in workflow YAML or committed `.env` files.
- [ ] Staging environment uses **synthetic/test data** only.

> Special Note for Codex: If you add security scans (CodeQL, npm audit, etc.), document them here so future agents know the expected gates.

---

## 9. Coverage & Success Criteria (Optional, but Good for Portfolio)

- [ ] Unit/integration tests generate coverage reports.
- [ ] Coverage thresholds are defined (e.g. `--coverageThreshold` in Jest) and enforced in CI, **or** documented as a future improvement.
- [ ] A known green run on `dev` or `main` is referenced in:
  - [ ] `docs/internal/initiatives/tests-4-contract-tests/postman-newman/CHECKLIST.md` (as a baseline).

> Special Note for Codex: When referencing coverage or green runs in PRs, link back to this checklist to keep the narrative consistent.

---

## 10. Final Gate

Before calling the backend pipeline “stable” and “portfolio-ready”:

- [ ] A full run of `backend-ci` on `dev` or `main` is green:
  - [ ] `checks` passes.
  - [ ] `tests` passes.
  - [ ] `contract_local` passes.
- [ ] A full run of `backend-ci` on `staging` is green for release readiness:
  - [ ] `deploy_staging` passes.
  - [ ] `contract_staging` passes.
- [ ] This checklist, the pipeline plan, and CI/CD strategy documents are updated to reflect the final state.

> Special Note for Codex: Do not mark the pipeline “ready” in commits/PRs unless every applicable box above is satisfied or updated.
