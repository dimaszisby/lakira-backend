# Lakira Frontend – GitHub Actions Pipeline Plan

## 1. Purpose

This plan defines the **intended structure** of the Lakira Frontend (`frontend-ci`) workflow:

- Jobs, stages, and dependencies,
- Commands executed in each job,
- How the workflow interacts with Vercel previews and backend staging APIs.

> Special Note for Codex: When generating or editing `.github/workflows/frontend-ci.yml`, mirror this plan exactly and update the document if you need to change job names or scripts.

---

## 2. Triggers

Workflow should run on:

- `push` to `main`, `develop`, `feature/**`
- `pull_request` targeting `main` or `develop`

---

## 3. Jobs & Stages

### 3.1 Job: `fe_checks`

**Goal:** Fail fast on lint/type issues.

- Runs on `ubuntu-latest`
- Steps:
  1. Checkout
  2. Setup Node 20 (npm cache)
  3. `npm ci`
  4. `npm run lint`
  5. `npm run typecheck`

### 3.2 Job: `fe_tests`

**Goal:** Run unit/component tests.

- Needs: `fe_checks`
- Set:
  - `API_URL=${{ secrets.STAGING_API_BASE_URL }}`
  - `NEXT_PUBLIC_API_BASE_URL=${{ secrets.STAGING_API_BASE_URL }}`
- Steps:
  1. Checkout
  2. Setup Node 20
  3. `npm ci`
  4. `npm run test`

### 3.3 Job: `fe_build`

**Goal:** Ensure Next.js build succeeds.

- Needs: `fe_tests`
- Set same API env vars (`API_URL`, `NEXT_PUBLIC_API_BASE_URL`)
- Steps:
  1. Checkout
  2. Setup Node 20
  3. `npm ci`
  4. `npm run build`

### 3.4 Job: `fe_e2e` (Optional/Future)

**Goal:** Playwright smoke tests against running Next.js or Vercel preview.

- Needs: `fe_build`
- Steps (local start):
  1. Checkout
  2. Setup Node 20
  3. `npm ci`
  4. Export `API_URL` + `NEXT_PUBLIC_API_BASE_URL`
  5. `npm run start &`
  6. Wait for `http://localhost:3000`
  7. `npm run test:e2e`

> Special Note for Codex: Only add this job to the workflow once Playwright dependencies (browsers) are configured per README instructions.

### 3.5 Deployment

Primary deployment path is **Vercel GitHub integration**. No job is required in Actions unless we later add a CLI deploy. If we do, it should run after `fe_build` and use `VERCEL_TOKEN/PROJECT_ID` secrets documented in the environment matrix.

---

## 4. Required Scripts

Ensure `package.json` contains:

- `lint`, `typecheck`, `test`, `test:e2e`, `build`, `start`

---

## 5. Artifacts & Reporting

- Optional: upload test results or `.next` build logs if needed for triage.
- If `fe_e2e` generates reports, store them under `artifacts/frontend-e2e`.

---

## 6. Updating the Plan

When changing workflow structure:

1. Update this plan
2. Update `.github/workflows/frontend-ci.yml`
3. Update `docs/internal/archive/frontend/ci-cd/README.md`
4. Mention the change in PR descriptions
