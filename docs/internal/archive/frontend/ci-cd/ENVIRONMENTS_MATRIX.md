# Lakira Frontend – Environments Matrix

## 1. Purpose

This matrix documents **all environments** that affect the Lakira Frontend (Next.js) and how they are configured:

- Base URLs and Vercel environments,
- Backend API URLs per environment,
- Environment variables and secrets used by CI and Vercel,
- How tests and previews consume the backend staging API.

> Special Note for Codex: When wiring frontend CI or Vercel env vars, read this file first.

---

## 2. Frontend Environments Overview

### 2.1 Summary Table

> Special Note for Codex: When updating pipeline scripts or Vercel settings, copy the URLs and env var names from this table verbatim to avoid drift.

| Env       | Purpose                                     | Frontend Host / Base URL                                       | Backend API URL                                      |
| --------- | ------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `local`   | Developer machine (Next dev server)         | `http://localhost:3000`                                        | `http://localhost:4000/api/v1`                       |
| `ci`      | GitHub Actions frontend tests/build         | No public URL (runs in CI job)                                 | `https://lakira-backend-staging.onrender.com/api/v1` |
| `preview` | Vercel Preview deployments per PR/branch    | `https://lakira-frontend-git-<branch>.vercel.app`              | `https://lakira-backend-staging.onrender.com/api/v1` |
| `prod`    | Production (can be same as staging for now) | `https://lakira.app` (or `https://lakira-frontend.vercel.app`) | `TBD` (production backend URL not available yet)     |

FE convention: set `API_URL` and `NEXT_PUBLIC_API_BASE_URL` to the same value per environment.

---

## 3. Local Environment

**Use case:** Normal frontend development with local backend.

- **Frontend:**
  - Dev URL: `http://localhost:3000`
  - Command: `npm run dev`
- **Backend:**
  - URL: `http://localhost:4000/api/v1`
- **Env configuration (example `.env.local`):**
  - `API_URL=http://localhost:4000/api/v1`
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`

Notes:

- Frontend code should keep `API_URL` and `NEXT_PUBLIC_API_BASE_URL` aligned per environment.
- Local E2E tests (Playwright/Cypress) can run against `localhost:3000` and the same local backend.

---

## 4. CI Environment (GitHub Actions)

**Use case:** `frontend-ci` workflow (lint → tests → build).

- No public host; Next.js build and tests run inside the CI job.
- **Backend for API calls in tests:**
  - Prefer using the **staging API URL** to validate against real contracts:
    - `STAGING_API_BASE_URL=https://lakira-backend-staging.onrender.com/api/v1`
- **Key env vars in CI jobs:**
  - `API_URL=${{ secrets.STAGING_API_BASE_URL }}`
  - `NEXT_PUBLIC_API_BASE_URL=${{ secrets.STAGING_API_BASE_URL }}`
  - Optional: `NODE_ENV=test`.

Secrets to define in GitHub (for FE repo or monorepo):

- `STAGING_API_BASE_URL` – the base URL of your backend staging `api/v1` endpoint.
- (Optional) If you deploy via Vercel CLI in Actions:
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
  - `VERCEL_TOKEN`

> Special Note for Codex: When generating `frontend-ci.yml`, read `STAGING_API_BASE_URL` from secrets and map it to both `API_URL` and `NEXT_PUBLIC_API_BASE_URL`.

---

## 5. Preview Environment (Vercel)

**Use case:** PR previews and branch builds.

- **Platform:** Vercel
- **URL pattern (example):**
  - `https://lakira-frontend-git-<branch>-<org>.vercel.app`
- **Backend for previews:**
  - Use staging backend (`https://lakira-backend-staging.onrender.com/api/v1`).

Vercel env vars:

- **Preview environment vars:**
  - `API_URL=https://lakira-backend-staging.onrender.com/api/v1`
  - `NEXT_PUBLIC_API_BASE_URL=https://lakira-backend-staging.onrender.com/api/v1`

These are configured in:

- Vercel project → **Settings → Environment Variables**:
  - Target: `Preview`

So any Preview deployment will call the staging backend.

---

## 6. Production Environment

For a portfolio project, you can either:

- Treat `Preview` as your “demo” environment, or
- Configure a separate `Production` domain.

If you configure a production domain:

- **Frontend host:**
  - `https://lakira.app` or `https://lakira-frontend.vercel.app`
- **Backend API:**
  - `TBD` (production backend URL not available yet).

Vercel production env vars:

- `API_URL=TBD`
- `NEXT_PUBLIC_API_BASE_URL=TBD`

---

## 7. Mapping Summary

| Layer        | Local                                                   | CI / Tests                                                     | Preview (Vercel)                                                              | Production (Vercel)            |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| Frontend URL | `http://localhost:3000`                                 | n/a                                                            | `https://lakira-frontend-git-<branch>.vercel.app`                             | `https://lakira.app` (example) |
| Backend URL  | `http://localhost:4000/api/v1`                          | `https://lakira-backend-staging.onrender.com/api/v1`           | `https://lakira-backend-staging.onrender.com/api/v1`                          | `TBD`                          |
| API_URL      | `API_URL=http://localhost:4000/api/v1`                  | `API_URL=${{ secrets.STAGING_API_BASE_URL }}`                  | `API_URL=https://lakira-backend-staging.onrender.com/api/v1`                  | `API_URL=TBD`                  |
| Next env var | `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1` | `NEXT_PUBLIC_API_BASE_URL=${{ secrets.STAGING_API_BASE_URL }}` | `NEXT_PUBLIC_API_BASE_URL=https://lakira-backend-staging.onrender.com/api/v1` | `NEXT_PUBLIC_API_BASE_URL=TBD` |

Keep this file updated when you change Vercel project settings or backend URLs.
