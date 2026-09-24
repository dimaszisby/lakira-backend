# Lakira Backend – GitHub Actions Workflow Guidelines

## 1. Purpose

These guidelines define **how to design, write, and maintain** GitHub Actions workflows for the Lakira Backend so that pipelines are:

- Fast and cost-effective,
- Deterministic and reproducible,
- Secure in their handling of secrets,
- Easy to debug and extend.

> Special Note for Codex: When generating or editing `.github/workflows/backend-ci.yml`, follow these guidelines unless explicitly overridden elsewhere.

---

## 2. General Principles

1. **Pipelines as Code**
   - All CI/CD logic lives in `.github/workflows/*.yml`.
   - Avoid manual, undocumented release steps for anything critical.

2. **Fail Fast, Then Go Deep**
   - Run lint and typecheck first.
   - Only run unit/integration/contract tests after basic checks pass.

3. **Deterministic & Idempotent**
   - Tests must not depend on wall-clock time or random data unless explicitly controlled.
   - DB migrations and seeds should be safe to re-run without corrupting data.

4. **Security by Default**
   - Secrets always come from `secrets.*`.
   - No credentials or tokens may be hard-coded in workflows.

5. **Observability**
   - Upload key reports (Jest, Schemathesis) as artifacts.
   - When running coverage jobs, rename/persist per-suite folders (e.g., `coverage/jest-unit`, `coverage/jest-integration`) before uploading so they are not overwritten.
   - Configure timeouts and clear failure points.

---

## 3. Workflow Structure

### 3.1 Naming & Triggers

Use clear workflow names and consistent triggers:

```yaml
name: Lakira Backend CI # promote-dev-to-staging.yml triggers on this exact name

on:
  push:
    branches:
      - main
      - dev
      - staging
      - "feat/**"
      - "fix/**"
      - "chore/**"
      - "ci/**"
      - "docs/**"
      - "refactor/**"
  pull_request:
    branches:
      - main
      - dev
      - staging
  workflow_dispatch:
```

> Working directory tip: set `defaults.run.working-directory` to the literal backend path (e.g., `.` or `./apps/backend`). GitHub Actions forbids `${{ env.* }}` expressions in this field, so edit the string directly when relocating the backend code.

### 3.2 Jobs & Dependencies

Standard jobs:

- `checks` – lint, format, typecheck, OpenAPI check
- `security_delta` – security framework tests, dependency delta, gate evaluation
- `tests` – unit + integration tests
- `contract_local` – Schemathesis against a locally started backend
- `deploy_staging` – deploy to Render staging (`staging` branch only)
- `smoke_staging` – smoke suite against live staging (`staging` branch only)
- `deploy_production` – deploy to production (`main` branch only, approval-gated)

Use `needs` to enforce ordering:

```yaml
jobs:
  checks:
    # first, in parallel with security_delta

  security_delta:
    # no needs

  tests:
    needs: [checks, security_delta]

  contract_local:
    needs: tests

  deploy_staging:
    needs: contract_local
    if: github.ref == 'refs/heads/staging'

  smoke_staging:
    needs: deploy_staging
    if: github.ref == 'refs/heads/staging'

  deploy_production:
    needs: contract_local
    if: github.ref == 'refs/heads/main'
```

### 3.3 Concurrency

Ensure only one pipeline per branch runs at a time:

```yaml
concurrency:
  group: backend-ci-${{ github.ref }}
  cancel-in-progress: true
```

This cancels older runs for the same ref when new commits are pushed.

### 3.4 Timeouts

Set reasonable job timeouts:

```yaml
jobs:
  checks:
    timeout-minutes: 10
  tests:
    timeout-minutes: 20
  contract_local:
    timeout-minutes: 30
  deploy_staging:
    timeout-minutes: 15
  smoke_staging:
    timeout-minutes: 10
```

Avoid unbounded runtimes; keep timeouts visible and justifiable.

---

## 4. Node Setup, Install Strategy & Caching

### 4.1 Node.js Setup

Use `actions/setup-node@v4` with a fixed version and npm caching:

```yaml
- name: Use Node.js 20
  uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm
```

Locking the version:

- Ensures consistency between local dev and CI,
- Reduces “works-on-my-machine” issues.

### 4.2 Dependency Installation

Use `npm ci` instead of `npm install`:

```yaml
- name: Install dependencies
  run: npm ci
```

- `npm ci` is deterministic and optimized for CI.
- Avoid running `npm ci` more than once per job.

---

## 5. Services: Postgres & Redis

Workflows that require data stores (e.g. `tests`, `contract_local`) should define service containers:

> Special Note for Codex: Reuse these exact service names, versions, and health checks when emitting workflow YAML so CI stays aligned with the environment matrix.

```yaml
services:
  postgres:
    image: postgres:18
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD_TEST }}
      POSTGRES_DB: lakira_ci
    ports:
      - 5432:5432
    options: >-
      --health-cmd="pg_isready -U postgres"
      --health-interval=10s
      --health-timeout=5s
      --health-retries=5

  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379
    options: >-
      --health-cmd="redis-cli ping"
      --health-interval=10s
      --health-timeout=5s
      --health-retries=5
```

Typical environment variables for these jobs:

```yaml
env:
  DATABASE_URL: postgres://postgres:${{ secrets.POSTGRES_PASSWORD_TEST }}@localhost:5432/lakira_ci
  DB_HOST: localhost
  DB_PORT: 5432
  DB_USER: postgres
  DB_PASSWORD: ${{ secrets.POSTGRES_PASSWORD_TEST }}
  DB_NAME: lakira_ci
  REDIS_URL: redis://localhost:6379
  NODE_ENV: test
  JWT_SECRET: ${{ secrets.JWT_SECRET_TEST }}
```

> Special Note for Codex: Jobs that run on GitHub’s hosted Ubuntu runner must talk to services via `localhost:<port>` because Actions forwards service ports to the host network. Only use service hostnames (`postgres`, `redis`) if the job itself runs inside a container. Keep `DATABASE_URL` as the canonical variable and surface `DB_*` envs only when scripts require username/password/database fields explicitly.

> Keep `wait-on` pinned as a dev dependency so the workflow never wastes time pulling it on-demand via `npx`.

---

## 6. Secrets & Security

### 6.1 Secret Storage

Store sensitive values only as GitHub Secrets, for example:

- `POSTGRES_PASSWORD_TEST`
- `JWT_SECRET_TEST`
- `RENDER_STAGING_DEPLOY_HOOK_URL`
- `STAGING_BASE_URL`
- `STAGING_HEALTH_URL`

Usage example:

```yaml
env:
  JWT_SECRET: ${{ secrets.JWT_SECRET_TEST }}
```

> Special Note for Codex: Before proposing new secrets or env var names, cross-check `docs/reference/environments.md` so the same identifiers exist everywhere (GitHub, Render, docs).

Never:

- Commit real `.env` files,
- Put tokens/passwords directly into YAML.

### 6.2 Additional Security Gates (Optional but Recommended)

Enable GitHub’s built-in security features:

- Secret scanning,
- Dependabot alerts,
- Dependency review.

These complement your own tests and keep the portfolio aligned with real-world expectations.

---

## 7. Artifacts, Reports & Failure Triage

### 7.1 Uploading Artifacts

Upload key artifacts to simplify debugging:

- Jest reports (optional),
- Schemathesis contract test reports (JUnit XML + HAR),
- Any custom logs if needed.

Example for Schemathesis (local):

```yaml
- name: Upload Schemathesis reports (local)
  uses: actions/upload-artifact@v4
  with:
    name: schemathesis-contract-local
    path: tests/contract/schemathesis/reports/local
```

### 7.2 Failure Triage Flow

When a job fails:

1. **Read the job logs** in GitHub Actions UI:
   - Identify if the failure is in install, migrations, tests, or contract suite.
2. **If contract tests fail**:
   - Read the failing check in the job log — Schemathesis prints the failing case,
     the received vs documented status codes, and a `curl` line that reproduces it,
   - For detail, download the `schemathesis-contract-local` artifact and open the JUnit
     XML or the HAR. Note the artifact step has no `if: always()`, so it only uploads on
     green runs — the job log is the reliable source on failure,
   - Check the run header: it must report **37 of 46 operations selected**. A lower count
     usually means `tmp/contract-seed.json` is missing, which the seeded-ID hook absorbs
     silently rather than erroring,
   - Decide whether the bug is in:
     - Backend implementation,
     - OpenAPI spec (an undocumented status code is a spec bug, not a test bug).
3. **If DB connectivity fails**:
   - Check Postgres/Redis service logs,
   - Ensure `DATABASE_URL` and `REDIS_URL` match your app’s configuration.
4. **If staging deploy fails**:
   - Inspect Render logs,
   - Check if migrations or app start command failed,
   - Fix the issue, redeploy, and re-run the workflow.

> Special Note for Codex: When summarizing a failed run, always point humans to the relevant artifact path(s) to inspect.

---

## 8. Example Skeleton: `backend-ci.yml`

> **Illustrative only.** This skeleton shows the shape; `.github/workflows/backend-ci.yml` is the
> source of truth and has more steps (seeding, Schemathesis, the RabbitMQ service, artefact
> uploads). Copy from the real file, not from here. The values that must match exactly — the
> workflow name, triggers, job names and `needs`, and service images — were re-checked on
> 2026-09-24.

The main backend CI workflow roughly aligns with this skeleton:

```yaml
name: Lakira Backend CI # promote-dev-to-staging.yml triggers on this exact name

on:
  push:
    branches:
      - main
      - dev
      - staging
      - "feat/**"
      - "fix/**"
      - "chore/**"
      - "ci/**"
      - "docs/**"
      - "refactor/**"
  pull_request:
    branches:
      - main
      - dev
      - staging
  workflow_dispatch:

concurrency:
  group: backend-ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm run docs:openapi:check

  tests:
    needs: [checks, security_delta]
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD_TEST }}
          POSTGRES_DB: lakira_ci
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
    env:
      DATABASE_URL: postgres://postgres:${{ secrets.POSTGRES_PASSWORD_TEST }}@localhost:5432/lakira_ci
      DB_HOST: localhost
      DB_PORT: 5432
      DB_USER: postgres
      DB_PASSWORD: ${{ secrets.POSTGRES_PASSWORD_TEST }}
      DB_NAME: lakira_ci
      REDIS_URL: redis://localhost:6379
      NODE_ENV: test
      JWT_SECRET: ${{ secrets.JWT_SECRET_TEST }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run db:migrate:test
      - run: npm run test:unit
      - run: npm run test:integration

  contract_local:
    needs: tests
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD_TEST }}
          POSTGRES_DB: lakira_ci
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
    env:
      DATABASE_URL: postgres://postgres:${{ secrets.POSTGRES_PASSWORD_TEST }}@localhost:5432/lakira_ci
      DB_HOST: localhost
      DB_PORT: 5432
      DB_USER: postgres
      DB_PASSWORD: ${{ secrets.POSTGRES_PASSWORD_TEST }}
      DB_NAME: lakira_ci
      REDIS_URL: redis://localhost:6379
      NODE_ENV: test
      JWT_SECRET: ${{ secrets.JWT_SECRET_TEST }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run docs:openapi:generate
      - run: npm run db:migrate:test
      - name: Start backend
        run: |
          nohup npm run start:test > /tmp/backend.log 2>&1 &
          echo $! > /tmp/backend.pid
      - name: Wait for backend
        run: |
          wait_with_logs() {
            "$@" || {
              echo "---- backend.log (tail) ----"
              tail -n 200 /tmp/backend.log || true
              echo "--------------------------------"
              exit 1
            }
          }
          wait_with_logs npx wait-on tcp:4000 --timeout 180000
          wait_with_logs npx wait-on http://localhost:4000/api/v1/health --timeout 180000
      - name: Seed contract fixtures
        run: npm run seed:contract-tests
      - name: Dump backend logs on failure
        if: always()
        run: |
          if [ "${{ job.status }}" != "success" ]; then
            echo "---- backend.log (tail) ----"
            tail -n 200 /tmp/backend.log || true
            echo "--------------------------------"
          fi
      - name: Stop backend
        if: always()
        run: |
          if [ -f /tmp/backend.pid ]; then
            kill "$(cat /tmp/backend.pid)" || true
            rm -f /tmp/backend.pid
          fi
      - name: Upload Schemathesis reports (local)
        uses: actions/upload-artifact@v4
        with:
          name: schemathesis-contract-local
          path: tests/contract/schemathesis/reports/local
          retention-days: 14
```

---

## 9. Maintenance

When changing job structure, timeouts, secrets, or artifact paths:

- Update this file,
- Update `docs/internal/initiatives/ci-pipeline/GITHUB_ACTIONS_PIPELINE_PLAN.md`,
- Update `docs/internal/initiatives/ci-pipeline/GITHUB_ACTIONS_PIPELINE_CHECKLIST.md`,
- Keep `.github/workflows/backend-ci.yml` in sync.

This keeps the backend CI documentation and implementation aligned and ready for portfolio review.
