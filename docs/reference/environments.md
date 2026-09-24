# Lakira Backend – Environments Matrix

> **This document describes the Render-based topology, which is now superseded in principle.**
> [ADR-0042](../explanation/decisions/adr-0042-vps-compose-deployment-topology.md) was **Accepted on
> 2026-09-15**: production and staging will both run as Docker Compose stacks on a self-managed VPS,
> and Render leaves the promotion path. Nothing has migrated yet, so the Render details below
> describe the environments that exist **today** — treat them as current state, not as the target.
> It should be rewritten as the migration lands, not before. (Local, CI, CORS and secret-name
> details were re-checked against the code on 2026-09-24.)

## 1. Purpose

This matrix documents **all environments** that touch the Lakira backend and how they are configured:

- Base URLs and Render service identifiers,
- Database and Redis details,
- Secrets / environment variables,
- Contract-fixture seed data.

Treat this as the **single source of truth** when wiring CI and Render.

> Special Note for Codex: When asked to “run tests in CI” or “deploy to staging”, read this file first to understand which URLs and secrets to use.

---

## 2. Backend Environments Overview

### 2.1 Summary Table

| Env       | Purpose                                                 | Backend Host / Base URL                                                          | DB Name              | Redis                                                                        |
| --------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `local`   | Dev machine / Docker Compose                            | `http://localhost:5000` (`npm run dev`); `http://localhost:8001` (Compose `app`) | `lakira_development` | `redis://localhost:6379`                                                     |
| `ci`      | GitHub Actions test & contract pipelines                | `http://localhost:4000` (service container)                                      | `lakira_ci`          | `redis://localhost:6379`                                                     |
| `staging` | Public “portfolio” environment on Render                | `https://lakira-backend-staging.onrender.com`                                    | `lakira_stage`       | Managed Redis (required: `REDIS_REQUIRED` defaults to `true` outside `test`) |
| `prod`\*  | Production (CI job exists; service not yet provisioned) | `TBD` (no production web-service URL yet)                                        | `lakira_prod`        | Managed Redis (required)                                                     |

\* CI already has a `deploy_production` job (runs on `main`, behind the `production` GitHub environment), but no production service is provisioned yet, and ADR-0042 moves it to a VPS.

### 2.2 FE-Consumable Backend Contract (Authoritative Values)

FE standard (agreed): `API_URL` and `NEXT_PUBLIC_API_BASE_URL` must be equal for the same environment.

| FE env target         | `API_URL`                                            | `NEXT_PUBLIC_API_BASE_URL`                           | Backend health URL                                          | Notes                                                           |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| `local`               | `http://localhost:5000/api/v1`                       | `http://localhost:5000/api/v1`                       | `http://localhost:5000/api/v1/health`                       | Local FE + `npm run dev`; use port `8001` for the Compose `app` |
| `preview` / `staging` | `https://lakira-backend-staging.onrender.com/api/v1` | `https://lakira-backend-staging.onrender.com/api/v1` | `https://lakira-backend-staging.onrender.com/api/v1/health` | Use this concrete value in FE CI and Vercel Preview             |
| `prod`                | `TBD`                                                | `TBD`                                                | `TBD`                                                       | Production backend service URL not available yet                |

Related secret names:

- Backend CI/CD: `STAGING_BASE_URL`, `STAGING_HEALTH_URL`
- FE CI/CD (recommended): `STAGING_API_BASE_URL` mapped to both FE runtime vars

`TBD` follow-up question: what is the production backend web-service base URL (including `/api/v1`) once production is provisioned?

---

## 3. Local Environment

**Use case:** Day-to-day development and manual API exploration.

- **Backend:**
  - `npm run dev`: `http://localhost:5000` (`PORT`, default `5000`)
  - Compose `app` service: `http://localhost:8001` (host 8001 → container 5000; host 5000 collides
    with AirPlay Receiver on macOS)
  - Port `4000` is only the test/contract server (`npm run start:test`)
- **Database (Postgres):**
  - Image: `postgres:18` (see the note below — same major everywhere)
  - Host: `localhost`
  - Port: `5432`
  - DB name: `lakira_development`
  - User: `lakira_user`
  - Password: `lakira_password` (all from `.env.example`)
- **Redis:**
  - URL: `redis://localhost:6379`
- **Environment variables (example):**
  - `DEVELOPMENT_DATABASE_URL=postgresql://lakira_user:lakira_password@127.0.0.1:5432/lakira_development`
    (or `DB_USER` / `DB_PASSWORD` / `DB_NAME`)
  - `REDIS_HOST=127.0.0.1`, `REDIS_PORT=6379`
  - `JWT_SECRET=<a long random secret>` — the app reads only `JWT_SECRET`
  - `NODE_ENV=development`
    Seeding / fixture notes:

- Use `npm run seed:contract-tests` when you need deterministic API fixtures for contract/smoke runs.
- Use a dedicated test user (e.g. `test@lakira.local`) shared across automated tests.

---

## 4. CI Environment (GitHub Actions)

**Use case:** the `Lakira Backend CI` workflow (`checks` and `security_delta` in parallel → `tests` → `contract_local`).

- **Backend runtime:**
  - Runs inside the `contract_local` job using `npm run start:test` on `http://localhost:4000`.
- **Postgres service (CI):**
  - Image: `postgres:18`
  - Host (from runner steps): `localhost` (GitHub Actions maps the service port to 127.0.0.1)
  - Hostname inside another container job: `postgres`
  - Port: `5432`
  - DB name: `lakira_ci`
  - User: `postgres`
  - Password: `${{ secrets.POSTGRES_PASSWORD_TEST }}`

> **Postgres version is pinned to the same major everywhere: `postgres:18`.** Render's managed
> Postgres runs 18, so dev Compose, `docker-compose.test.yml` (which inherits the base image), and
> the CI services all match it. Before 2026-08-23 these were 17 / 17 / 15 respectively — the gate
> that decides whether a change merges ran two majors behind production.
>
> The images are deliberately **not** the `-alpine` variant. Alpine is musl-based and Render is
> glibc, and Postgres takes text collation from the OS locale, so the two order text differently:
>
> ```text
> musl  : Apricot, Banana, apple, banana, cherry   <- codepoint order
> glibc : apple, Apricot, banana, Banana, cherry   <- dictionary order
> ```
>
> The API exposes `?sort=name` on a text column and cursor pagination keys on that ordering, so a
> musl/glibc split would return different pages in CI than in production. Redis keeps `-alpine`
> (`redis:7-alpine`) — it has no collation semantics, so only the pin consistency matters.

- **Redis service (CI):**
  - Image: `redis:7-alpine`
  - Host: `localhost` (use `redis` only if the job itself runs inside a container)
  - Port: `6379`
- **Key env vars in CI jobs:**
  - `DATABASE_URL=postgres://postgres:${{ secrets.POSTGRES_PASSWORD_TEST }}@localhost:5432/lakira_ci`
  - `DB_HOST=localhost`
  - `DB_PORT=5432`
  - `DB_USER=postgres`
  - `DB_PASSWORD=${{ secrets.POSTGRES_PASSWORD_TEST }}`
  - `DB_NAME=lakira_ci`
  - `REDIS_URL=redis://localhost:6379`
  - `NODE_ENV=test`
  - `JWT_SECRET=${{ secrets.JWT_SECRET_TEST }}`
  - `DISABLE_RATE_LIMITING=true` during `tests` and `contract_local` so Schemathesis sees 2xx/4xx responses instead of global 429 throttles. Leave unset in other environments to keep production limits enforced.
  - `ALLOW_TEST_HTTP_SERVER=true` is injected by `npm run start:test` so the HTTP server can bind to port `4000` even in `NODE_ENV=test`.

Secrets to define in GitHub:

- `POSTGRES_PASSWORD_TEST`
- `JWT_SECRET_TEST`

Contract fixtures in CI:

- `contract_local` runs `npm run seed:contract-tests` as an explicit step, writing
  `tmp/contract-seed.json`. Schemathesis reads `primaryUser.token` from it for
  `SCHEMATHESIS_LOCAL_TOKEN`, and `tests/contract/hooks/seeded_ids.py` reads the seeded IDs.
  The hook degrades **silently** if the file is absent, so keep the seed step ahead of it.

> Special Note for Codex: Default GitHub Actions jobs run directly on the Ubuntu host, so reference `localhost` for `DATABASE_URL`/`REDIS_URL` (ports are forwarded from the service containers). Only use the container hostnames (`postgres`, `redis`) when the workflow job itself runs inside another container. Always keep `DATABASE_URL` as the source of truth and export `DB_*` variables only when a tool (e.g., `sequelize-cli`) still expects discrete fields.

---

## 5. Staging Environment (Render)

**Use case:** Public, stable environment for recruiters, FE integration, and staging contract tests.

- **Platform:** Render PaaS
- **Service (example):**
  - Service name: `lakira-backend-staging`
  - Region: `singapore` (example; pick closest to Jakarta)
- **Backend URL:**
  - Active web service: `https://lakira-backend-staging.onrender.com`
  - Active API base URL: `https://lakira-backend-staging.onrender.com/api/v1`
  - Custom domain: `TBD` (not configured in docs yet)
- **Health endpoint:**
  - `GET /api/v1/health` → 200 + `{ "status": "ok" }`

- **Database:**
  - Hosted Postgres on Render or managed provider
  - DB name: `lakira_stage`
  - Connection string stored as:
    - `DATABASE_URL` Render env var.

- **Redis (required):** with `NODE_ENV=production`, `REDIS_REQUIRED` defaults to `true`, so the
  app refuses to start without it (ADR-0042 also treats it as required).
  - Connection string stored as the `REDIS_URL` Render env var.

- **Important environment vars on Render (staging):**
  - `NODE_ENV=production`
  - `DATABASE_URL=postgres://.../lakira_stage`
  - `REDIS_URL=redis://...`
  - `JWT_SECRET=...` (the app reads only `JWT_SECRET`; give staging its own value)
  - `PORT=10000` (Render default) → app should bind to `0.0.0.0:${PORT}`

### 5.1 CORS Expectations for FE (Guidance Only, No Code Change)

Current backend behavior in `src/server.ts`:

- `origin`: the `CORS_ORIGIN` allowlist — a comma-separated list of origins, trimmed
  (ADR-0034); defaults to `http://localhost:3000` when unset.
- `credentials: true`.
- `methods`: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.

Recommended FE alignment guidance:

| FE surface          | Expected CORS origin to allow         | Notes                                                                                                                                     |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Local FE dev        | `http://localhost:3000`               | Matches backend default today                                                                                                             |
| FE preview (Vercel) | Preview domain(s) for active branches | List each origin in `CORS_ORIGIN`, comma-separated. Matching is exact: no wildcards, and case and trailing slash matter (open finding F6) |
| FE production       | Final FE production domain            | `TBD` until FE production domain is finalized                                                                                             |

GitHub secrets for staging deploy:

- `RENDER_STAGING_DEPLOY_HOOK_URL` – Render deploy hook URL.
- `STAGING_BASE_URL` – e.g. `https://lakira-backend-staging.onrender.com/api/v1`
- `STAGING_HEALTH_URL` – e.g. `https://lakira-backend-staging.onrender.com/api/v1/health`
- (Optional) `RENDER_API_KEY` / `RENDER_SERVICE_ID` – if you move from deploy hooks to Render API/CLI deployments.

Staging verification:

- `npm run test:smoke` reads `SMOKE_BASE_URL` (falling back to `STAGING_BASE_URL`) and needs
  nothing else — no token, no fixtures. See `tests/smoke/run-smoke.mjs`.

Seed / fixture policy:

- Use synthetic data only.
- Seed a dedicated test account (e.g. `staging-tester@lakira.app`) for contract tests.
- Run seeds as part of staging DB migrations or a separate one-off script.

---

## 6. Production Environment (not yet provisioned)

CI has a `deploy_production` job (runs on `main`, needs `contract_local`, behind the `production`
GitHub environment's approval gate), but no production service exists yet. ADR-0042 will put it on
the VPS rather than Render.

- **Backend URL:** `TBD` (production service URL not available yet)
- **Database:** `lakira_prod` with stricter access controls.
- **Secrets the `deploy_production` job reads:** `RENDER_PRODUCTION_DEPLOY_HOOK_URL`, `PRODUCTION_HEALTH_URL`, `PRODUCTION_DATABASE_URL`, `JWT_SECRET_PRODUCTION`.
- **Contract tests:** You may run **read-only** contract tests against prod, but **avoid destructive requests** (no DELETE / PUT that modify data) unless using a dedicated prod test tenant.

Document those here once created.
