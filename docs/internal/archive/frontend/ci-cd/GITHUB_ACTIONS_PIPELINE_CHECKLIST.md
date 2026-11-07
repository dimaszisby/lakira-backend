# Lakira Frontend – GitHub Actions Pipeline Checklist

Use this checklist when creating or modifying `.github/workflows/frontend-ci.yml`.

---

## 1. Workflow & Docs

- [ ] Workflow exists at `.github/workflows/frontend-ci.yml`.
- [ ] Workflow name is descriptive (e.g. `frontend-ci`).
- [ ] Docs updated:
  - [ ] `docs/internal/archive/frontend/ci-cd/README.md`
  - [ ] `docs/internal/archive/frontend/ci-cd/GITHUB_ACTIONS_PIPELINE_PLAN.md`
  - [ ] `docs/internal/archive/frontend/ci-cd/ENVIRONMENTS_MATRIX.md`
  - [ ] `docs/reference/frontend-handoff.md` (when FE/BE dependency details change)

> Special Note for Codex: If you add/remove jobs, update the plan & README in the same PR.

---

## 2. Triggers & Concurrency

- [ ] Runs on `push` to `main`, `develop`, `feature/**`.
- [ ] Runs on `pull_request` targeting `main`, `develop`.
- [ ] Workflow uses concurrency to cancel duplicate branch runs.

---

## 3. Jobs

- [ ] `fe_checks` runs `npm ci`, `npm run lint`, `npm run typecheck`.
- [ ] `fe_tests` needs `fe_checks` and runs `npm run test`.
- [ ] `fe_build` needs `fe_tests` and runs `npm run build`.
- [ ] (Optional) `fe_e2e` needs `fe_build` and runs `npm run test:e2e` after starting the app.
- [ ] Each job sets `timeout-minutes`.

> Special Note for Codex: Do not wire `fe_e2e` until Playwright dependencies are installed or documented in the README.

---

## 4. Environment Variables & Secrets

- [ ] `API_URL` comes from `secrets.STAGING_API_BASE_URL`.
- [ ] `NEXT_PUBLIC_API_BASE_URL` comes from `secrets.STAGING_API_BASE_URL`.
- [ ] If using Vercel CLI: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` exist.
- [ ] No secrets are hard-coded in workflow YAML.

---

## 5. Scripts & Dependencies

- [ ] `package.json` contains `lint`, `typecheck`, `test`, `test:e2e`, `build`, `start`.
- [ ] Workflow uses `actions/setup-node@v4` with `cache: npm`.
- [ ] Installs use `npm ci`.

---

## 6. Artifacts & Reporting

- [ ] (Optional) Test reports/artifacts uploaded if generated.
- [ ] E2E job (if enabled) uploads its report/logs for debugging.

---

## 7. Vercel Deploy Integration

- [ ] Vercel GitHub integration is enabled for previews.
- [ ] If CLI deploy job exists, it runs after `fe_build` and uses secrets from the environment matrix.

---

## 8. Final Gate

- [ ] Latest run of `frontend-ci` on `develop` or `main` is green.
- [ ] Checklist updated if expectations change.
