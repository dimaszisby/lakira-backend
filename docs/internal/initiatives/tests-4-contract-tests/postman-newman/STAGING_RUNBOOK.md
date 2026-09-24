# Staging Contract Tests Runbook – Lakira Backend

**Status:** Superseded — Newman was retired in #75 (`a4635f3`), and the `contract_staging` job it
describes was replaced by `smoke_staging`. Kept as history.

Use this guide when preparing or executing the `contract_staging` flow (either manually or via CI). It supplements the Postman README, the CI pipeline plan, and the Phase 3 checklist.

## 1. Prerequisites

1. **Staging deploy hook + health endpoint**
   - `RENDER_STAGING_DEPLOY_HOOK_URL` configured in GitHub secrets.
   - `STAGING_HEALTH_URL` (e.g., `https://lakira-backend-staging.onrender.com/api/v1/health`) reachable.
2. **Deterministic staging fixtures**
   - Staging database seeded with the IDs from `docs/internal/initiatives/tests-4-contract-tests/seed-strategy.md`.
   - JWT(s) generated for the seeded primary (and optional service account) user.
3. **Secrets populated in GitHub Actions**
   - `STAGING_BASE_URL`, `STAGING_CONTRACT_TOKEN`, `STAGING_CONTRACT_USER_ID`, `STAGING_CONTRACT_SECONDARY_USER_ID`.
   - Category/metric/metric-settings/log IDs (`STAGING_CATEGORY_*`, `STAGING_METRIC_*`, `STAGING_METRIC_SETTINGS_*`, `STAGING_METRIC_LOG_*`).
   - Schemathesis tokens (`SCHEMATHESIS_STAGING_BASE_URL`, `SCHEMATHESIS_STAGING_TOKEN`) even if Schemathesis-on-staging is a future step.
   - Document rotation dates in `metrics-tracker.md`.
4. **Workflow alignment**
   - `.github/workflows/backend-ci.yml` contains `deploy_staging` → `contract_staging`.
   - Branch protection requires `contract_local` so staging runs only after local suite is green.

## 2. CI Flow Walkthrough

1. `deploy_staging`
   - Triggers Render deploy via `curl -X POST "$RENDER_STAGING_DEPLOY_HOOK_URL"`.
   - Polls `STAGING_HEALTH_URL` until HTTP 200 (5-minute timeout).
   - If health never returns 200, inspect Render logs, fix the deploy, and rerun.
2. `contract_staging`
   - Checks out repo, installs deps, runs `npm run test:contract:staging`.
   - `scripts/run-contract-staging.js` injects secrets into Newman env overrides.
   - Reports saved under `tests/contract/postman-newman/reports/staging/<timestamp>/` and uploaded as `newman-contract-staging`.
3. (Future) Schemathesis staging run
   - After Newman, call `npm run test:contract:schemathesis:staging`.
   - Upload HAR + JUnit artifacts to `schemathesis-contract-staging`.

## 3. Manual Verification (Optional)

If you need to reproduce staging failures locally:

1. Export the staging secrets to your shell (never commit them).
2. Run:

   ```bash
   STAGING_BASE_URL=https://... \
   STAGING_CONTRACT_TOKEN=... \
   node tests/contract/postman-newman/scripts/run-contract-staging.js
   ```

3. Inspect `tests/contract/postman-newman/reports/staging/<timestamp>/` for HTML/JUnit outputs.

## 4. Metrics & Documentation Updates

- After the first successful CI run:
  - Update `metrics-tracker.md` with runtime, pass/fail counts, and artifact link.
  - Check off the relevant Phase 3 checklist item and note the commit/PR.
  - Log any incidents or notable findings in `incidents.md`.
- On failures:
  - Attach report paths to issue/incident tickets.
  - Summarize root cause in the tracker to show learnings (schema drift, auth expiry, etc.).

## 5. Secret Rotation Checklist

Whenever staging data is reseeded or tokens expire:

1. Run the deterministic seed routine against staging DB.
2. Capture new IDs/tokens.
3. Update GitHub secrets listed in §1.3.
4. Record the rotation date, owner, and reason in `metrics-tracker.md` or `incidents.md`.
5. Trigger a staging contract run to ensure the new values are valid.

Maintaining this runbook helps keep Phase 3 auditable and ensures portfolio reviewers can trace how contract tests protect staging deployments.
