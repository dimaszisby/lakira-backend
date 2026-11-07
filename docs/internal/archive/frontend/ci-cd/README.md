# Lakira Frontend – CI/CD Overview (GitHub Actions + Vercel)

## 1. Purpose

This document describes the **CI/CD pipeline** for the Lakira Frontend (Next.js):

- Which checks and tests run on each push / pull request,
- How Vercel Preview deployments are produced,
- How the frontend consumes the backend API in CI, Preview, and Production.

For project-wide strategy, see `docs/reference/ci-pipeline/strategy.md`.  
For environment details, see `docs/internal/archive/frontend/ci-cd/ENVIRONMENTS_MATRIX.md`.  
For job-by-job expectations, see `docs/internal/archive/frontend/ci-cd/GITHUB_ACTIONS_PIPELINE_PLAN.md` and `GITHUB_ACTIONS_PIPELINE_CHECKLIST.md`.
For BE-to-FE contract/deploy dependencies, see `docs/reference/frontend-handoff.md`.

> Special Note for Codex: When generating or editing `.github/workflows/frontend-ci.yml`, follow this document and the environment matrix.

---

## 2. Goals

- On every frontend change:
  - Run **lint** and **typecheck**,
  - Run **unit/component tests** (Vitest/Jest + RTL),
  - Optionally run **E2E tests** (Playwright) against a staging backend,
  - Build the Next.js app.

- On `main` / `develop` / PRs:
  - Produce **Vercel Preview deployments** (via Vercel GitHub integration),
  - Ensure the app points at the **staging backend API**.

- Keep the pipeline:
  - **Fast** enough for active development,
  - **Production-like** in structure,
  - **Clear** as a portfolio talking point.

---

## 3. Workflow & Triggers

Frontend CI is implemented in:

- `.github/workflows/frontend-ci.yml`

Recommended triggers:

```yaml
on:
  push:
    branches:
      - main
      - develop
      - "feature/**"
  pull_request:
    branches:
      - main
      - develop
```

Jobs (planned):

1. `fe_checks` – lint & typecheck
2. `fe_tests` – unit/component tests
3. `fe_build` – Next.js build
4. `fe_e2e` (optional) – Playwright E2E
5. Deployment handled by **Vercel GitHub integration** (primary path).

---

## 4. Required `package.json` Scripts (Frontend)

The frontend `package.json` should include at least:

- `"lint": "next lint"` – ESLint via Next
- `"typecheck": "tsc --noEmit"` – TypeScript type checks
- `"test": "vitest run"` or `"jest"` – unit/component tests
- `"test:e2e": "playwright test"` – optional Playwright E2E
- `"build": "next build"` – production build
- `"start": "next start"` – serve production build locally

> Special Note for Codex: When normalizing frontend scripts, ensure these commands exist and are used by `frontend-ci.yml`.

---

## 5. Environments & Secrets

Frontend CI uses the environments defined in `ENVIRONMENTS_MATRIX.md`.

Key points:

- In **local dev**:
  - `API_URL=http://localhost:4000/api/v1`
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`

- In **CI and Vercel Preview**:
  - `API_URL` and `NEXT_PUBLIC_API_BASE_URL` should both point to the staging backend:
    - `https://lakira-backend-staging.onrender.com/api/v1`.

### 5.1 GitHub Secrets for Frontend CI

Define in GitHub:

- `STAGING_API_BASE_URL` – `https://lakira-backend-staging.onrender.com/api/v1`.

In `frontend-ci.yml`, map:

```yaml
env:
  API_URL: ${{ secrets.STAGING_API_BASE_URL }}
  NEXT_PUBLIC_API_BASE_URL: ${{ secrets.STAGING_API_BASE_URL }}
```

Optional (if you use Vercel CLI deployment from Actions):

- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`

> Special Note for Codex: Do not introduce new secret/env names in PRs unless this section and the environment matrix are updated together.

### 5.2 Vercel Environment Variables

In the Vercel project settings:

- **Preview environment vars**:
  - `API_URL=https://lakira-backend-staging.onrender.com/api/v1`
  - `NEXT_PUBLIC_API_BASE_URL=https://lakira-backend-staging.onrender.com/api/v1`
- **Production environment vars**:
  - `API_URL=TBD`
  - `NEXT_PUBLIC_API_BASE_URL=TBD`

---

## 6. Pipeline Shape

### 6.1 Job: `fe_checks` – Lint & Typecheck

- **Goal:** Fail fast on lint/type issues.
- **Runs on:** `ubuntu-latest`
- **Steps (example):**

```yaml
fe_checks:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - run: npm run lint
    - run: npm run typecheck
```

### 6.2 Job: `fe_tests` – Unit / Component Tests

- **Goal:** Validate UI logic and components.
- **Needs:** `fe_checks`
- **Runs on:** `ubuntu-latest`
- **Steps (example):**

```yaml
fe_tests:
  needs: fe_checks
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - name: Set API base URL
      run: |
        echo "API_URL=${{ secrets.STAGING_API_BASE_URL }}" >> $GITHUB_ENV
        echo "NEXT_PUBLIC_API_BASE_URL=${{ secrets.STAGING_API_BASE_URL }}" >> $GITHUB_ENV
    - run: npm run test
```

### 6.3 Job: `fe_build` – Next.js Build

- **Goal:** Ensure the app builds in production mode.
- **Needs:** `fe_tests`
- **Runs on:** `ubuntu-latest`
- **Steps (example):**

```yaml
fe_build:
  needs: fe_tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - name: Set API base URL
      run: |
        echo "API_URL=${{ secrets.STAGING_API_BASE_URL }}" >> $GITHUB_ENV
        echo "NEXT_PUBLIC_API_BASE_URL=${{ secrets.STAGING_API_BASE_URL }}" >> $GITHUB_ENV
    - run: npm run build
```

Optionally upload `.next` or build logs as artifacts if builds are flaky.

### 6.4 Job: `fe_e2e` (Optional) – Playwright E2E

If you later add E2E:

- **Needs:** `fe_build`
- **Goal:** Exercise critical flows against a running frontend.

Two options:

1. **Run `next start` in the job** and hit `http://localhost:3000`.
2. **Target a Vercel Preview URL** exposed via environment variable or PR comment.

Example (local `next start`):

```yaml
fe_e2e:
  needs: fe_build
  runs-on: ubuntu-latest
  timeout-minutes: 30
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - name: Set API base URL
      run: |
        echo "API_URL=${{ secrets.STAGING_API_BASE_URL }}" >> $GITHUB_ENV
        echo "NEXT_PUBLIC_API_BASE_URL=${{ secrets.STAGING_API_BASE_URL }}" >> $GITHUB_ENV
    - name: Start Next.js
      run: npm run start &
    - name: Wait for frontend
      run: npx wait-on http://localhost:3000
    - name: Run E2E tests
      run: npm run test:e2e
```

### 6.5 Playwright Dependencies

- Install Playwright browsers via `npx playwright install --with-deps` in local dev and CI before enabling `fe_e2e`.
- Ensure CI job has access to necessary apt packages (use `microsoft/playwright-github-action` or manual install).
- Reuse `API_URL` + `NEXT_PUBLIC_API_BASE_URL` pointing at staging to keep flows realistic.

> Special Note for Codex: When enabling this job, include the browser-install step explicitly and reference this subsection in PR descriptions.

---

## 7. Vercel Preview Deployments

Primary deployment path for Lakira FE:

- Use the **Vercel GitHub Integration**:
  - On pushes/PRs, Vercel automatically:
    - Builds the app,
    - Creates Preview deployments,
    - Posts a Preview URL on the PR.

CI responsibilities:

- Ensure tests and builds are green before merging to `main`.
- Ensure the app is configured with `API_URL` + `NEXT_PUBLIC_API_BASE_URL` for staging/production in Vercel settings.

Optional: If you want to drive deploys from Actions instead of automatic integration, you can add a `fe_deploy_preview` job using the Vercel CLI:

```yaml
fe_deploy_preview:
  needs: fe_build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - name: Deploy to Vercel (preview)
      run: npx vercel --token ${{ secrets.VERCEL_TOKEN }} --scope ${{ secrets.VERCEL_ORG_ID }} --prod=false
```

> Special Note for Codex: Prefer the native Vercel GitHub integration for this project; CLI-driven deploys can be added later as an advanced example.

---

## 8. Relationship to Backend

- Frontend tests assume the **backend staging environment** is healthy and contract-tested.
- `API_URL` and `NEXT_PUBLIC_API_BASE_URL` in CI/Preview should both match backend staging (`STAGING_API_BASE_URL` in FE secrets, equivalent to backend `STAGING_BASE_URL`).
- When backend contracts change:
  - Update OpenAPI and backend contract tests,
  - Adjust frontend calls and tests,
  - Validate via combined FE + BE CI.
- Use `docs/reference/frontend-handoff.md` as the shared release/dependency checklist between FE and BE.

---

## 9. Future Extensions

Later you can add:

- Frontend test strategy doc under `docs/tests/**`,
- Frontend CI/CD plan and checklist:
  - `docs/internal/archive/frontend/ci-cd/GITHUB_ACTIONS_PIPELINE_PLAN.md`
  - `docs/internal/archive/frontend/ci-cd/GITHUB_ACTIONS_PIPELINE_CHECKLIST.md`

Modeled after the backend equivalents, to complete the full-stack CI/CD story for Lakira.
