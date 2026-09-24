# CI/CD Developer Simplified Guide

This guide explains how Lakira Backend’s automation works and what a junior developer should do locally before committing or opening a pull request. Use it as a quick reference when contributing new features or fixing bugs.

## 1. Pipeline Overview

1. **Static Checks (job: `checks`)**
   - `npm run lint` (covers `__tests__/**` too; `npm run lint:tests` is a faster local subset, not a CI step)
   - `npm run format:check`
   - `npm run typecheck`
   - `npm run docs:openapi:check`
2. **Security Delta Gate (job: `security_delta`)**
   - `npm run test:unit:security-framework`
   - `npm run security:delta:check`
   - `npm run security:gate:evaluate`
   - Uploads artifacts from `tmp/security/*` as CI artifact `backend-security-delta`.
   - Soft gate rule: CI fails on unresolved **High/Critical** findings only.
3. **Unit and Integration Tests (job: `tests`, needs `checks` and `security_delta`)**
   - `npm run build`, `npm run db:migrate:test`
   - `npm run test:unit`, then `npm run test:integration` (sequential, `NODE_ENV=test`)
   - `npm run test:unit:coverage` and `npm run test:integration:coverage` — these are the runs that
     enforce the coverage thresholds in `jest.config.mjs` (unit ≥ 60 % statements / ≥ 40 % branches /
     ≥ 55 % functions / ≥ 60 % lines). Plain `test:unit` collects no coverage and enforces nothing.
     Artifacts land in `coverage/jest-unit` and `coverage/jest-integration`, both uploaded
4. **Contract Tests (job: `contract_local`, needs `tests`)**
   - Seeds fixtures, boots the built server, runs Schemathesis against the spec.
5. **Deploy (`deploy_staging` → `smoke_staging` on `staging`; `deploy_production` on `main`)**

`checks` and `security_delta` run in parallel; everything after waits on both. A failure in any
job blocks the jobs that need it.

## 1.1 Security Gate Quick Reference

- Run locally before PRs that touch backend behavior or security-sensitive code:
  - `npm run test:unit:security-framework`
  - `npm run security:delta:gate`
- Main generated files:
  - `tmp/security/security-delta-report.json`
  - `tmp/security/security-gate-result.json`
  - `tmp/security/npm-audit-production.json`
- CI artifact name:
  - `backend-security-delta`
- Detailed references:
  - `docs/how-to/security/README.md`
  - `docs/how-to/security/run-a-security-audit.md`
  - `docs/how-to/security/release-delta-sop.md`
  - `docs/reference/security/ci-gate-policy.json`

## 1.2 Production Release Security Delta (Mandatory)

Before every production release, run the release SOP:

- `docs/how-to/security/release-delta-sop.md`

Minimum required local commands:

```bash
npm run test:unit:security-framework
npm run security:delta:gate
```

Release branch protection baseline (GitHub settings):

1. Require status checks: `checks`, `security_delta`, `tests`.
2. Require Code Owners review.
3. Require pull request review before merge.

## 2. Local Pre-Commit / Pre-PR Checklist

Before committing or opening a PR:

1. `npm install` (after pulling main) to stay aligned with lockfile.
2. `npm run lint` – ensure repo-wide ESLint passes.
3. `npm run lint:tests` – quickly validate the Jest env guardrail.
4. `npm run format:write` – fix formatting locally before `format:check` runs in CI.
5. `npm run typecheck` – catch TS errors.
6. `npm run test:unit` (always) and `npm run test:unit:coverage` when you need the coverage thresholds checked — only the `:coverage` scripts enforce them.
7. `npm run test:integration` when persistence, HTTP wiring, or migrations are touched.
8. For API/schema updates: `npm run docs:openapi:check` and commit spec changes if needed.
9. Run `npm run test:unit:security-framework` after changing security templates/scripts/policies.
10. Run `npm run security:delta:gate` for backend/security-impacting changes.
11. Stage files and let Husky run `npm run lint-staged` (ESLint + Prettier on staged files) before the commit is created.
12. For production release PRs, follow `docs/how-to/security/release-delta-sop.md` and update the active security audit run docs.

Document command outputs or screenshots in the PR description for easier reviewer triage.

## 3. Developer Environment Expectations

- **Node/npm**: Node 20.x LTS (matches `.nvmrc`, `.node-version`, `package.json "engines"`); use `nvm use` or `asdf` to stay aligned with CI.
- **Env files**: `.env.test` for local tests; other environments handled via `dotenv` scripts.
- **Databases**: Unit/static checks do not require DB access; integration tests expect Postgres/Redis reachable using the values in `.env.test`.
- **Tooling**: Husky is installed via `npm install` (`prepare` script). Disable only with team approval (CI is the source of truth).
- **Dependencies**: Follow the [dependency policy](../../reference/security/dependency-policy.md) — never run `npm audit fix --force`; upgrade runtime libs via PR + full CI evidence; run `npm audit --production` before releasing.

## 4. CI Failure Playbook

| Stage             | Typical Failure Causes                                  | What To Do                                                                                                                                          |
| ----------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static checks     | Lint/type errors, formatting drift, OpenAPI diffs       | Re-run same command locally, fix, re-run `npm run lint` & `npm run lint:tests`.                                                                     |
| Security gate     | Unresolved High/Critical findings from delta checks     | Run `npm run security:delta:gate`, inspect `tmp/security/security-gate-result.json`, remediate blockers, then re-run.                               |
| Unit tests        | Missing coverage, flaky mocks, updated business logic   | Add/update suites under `__tests__/unit/**`, ensure `withTestEnv` usage.                                                                            |
| Integration tests | DB migrations, Sequelize schema drift, HTTP regressions | Re-run `npm run test:integration`, check migrations and seed data.                                                                                  |
| Contract/E2E      | API schema mismatch, environment drift                  | Rerun `npm run docs:openapi:generate`, refresh contract seeds, export a Schemathesis token (see §7), and ensure `DISABLE_RATE_LIMITING=true` in CI. |

Always push fixes to the same branch; reruns are automatic once CI detects new commits.

## 5. Branching & PR Hygiene

- Branch from `dev` (or the branch the team specifies), named `<type>/<slug>` — see `.claude/rules/workflow.md`.
- Align commit messages with the issue/ticket ID when possible.
- Keep PRs small and focused; describe changes + commands you ran.
- If you skip a test due to timeline pressure, note it in the PR and create a TODO in `docs/internal/todos/`.

## 6. Useful Scripts Reference

| Script                                 | Purpose                                                             |
| -------------------------------------- | ------------------------------------------------------------------- |
| `npm run lint`                         | ESLint full repo                                                    |
| `npm run lint:fix`                     | ESLint auto-fix                                                     |
| `npm run lint:tests`                   | ESLint scoped to `__tests__/**` guardrail                           |
| `npm run format:write`                 | Prettier auto-format                                                |
| `npm run typecheck`                    | TypeScript `--noEmit`                                               |
| `npm run test:unit`                    | Jest unit project                                                   |
| `npm run test:unit:security-framework` | Security framework validation tests (templates/schemas/gate policy) |
| `npm run test:unit:coverage`           | Jest unit coverage                                                  |
| `npm run test:integration`             | Jest integration project                                            |
| `npm run docs:openapi:check`           | Regenerate and diff OpenAPI spec                                    |
| `npm run security:delta:check`         | Generate security delta report + npm audit artifact                 |
| `npm run security:gate:evaluate`       | Evaluate findings against soft gate policy                          |
| `npm run security:delta:gate`          | Run delta check + gate evaluation in one command                    |
| `npm run lint-staged`                  | Pre-commit automation (eslint + prettier on staged files)           |

## 7. Contract Tests + Schemathesis Quickstart

0. **Install the Schemathesis CLI (one-time)**

   ```bash
   python3 -m venv .venv-schemathesis
   source .venv-schemathesis/bin/activate
   pip install -r tests/contract/schemathesis/requirements.txt
   ```

   (Alternatively, point `SCHEMATHESIS_CLI` to an existing global binary.)

   > Shortcut: run `npm run contract:local:full` to execute every step below automatically (build → migrate → seed → start backend → Schemathesis → cleanup). Server logs are written to `tmp/backend-contract.log`. The helper runs on port 4000, matching `.env.test.example` and CI; override with `CONTRACT_LOCAL_PORT`. The helper automatically prefers `.venv-schemathesis/bin/schemathesis` (or any binary pointed to by `SCHEMATHESIS_CLI`), so install the Python virtualenv once using the commands above.

1. **Prep the backend**
   - Run `npm run db:migrate:test`.
   - Start the API with throttling disabled so fuzzing doesn’t hit 429s:  
     `DISABLE_RATE_LIMITING=true ALLOW_TEST_HTTP_SERVER=true npm run start:test`
2. **Seed deterministic data**  
   `npm run seed:contract-tests` writes `tmp/contract-seed.json` containing the `primaryUser.token` consumed by Schemathesis.
3. **Export Schemathesis vars**
   ```bash
   export SCHEMATHESIS_LOCAL_TOKEN=$(node -e 'const seed=require("./tmp/contract-seed.json"); if(!seed?.primaryUser?.token) process.exit(1); process.stdout.write(seed.primaryUser.token);')
   export SCHEMATHESIS_LOCAL_BASE_URL=${SCHEMATHESIS_LOCAL_BASE_URL:-http://localhost:4000/api/v1}
   export SCHEMATHESIS_HOOKS=${SCHEMATHESIS_HOOKS:-tests.contract.hooks.seeded_ids}
   ```
   The hook module keeps Hypothesis pointing at seeded IDs; the npm scripts set this env var automatically, but export it when invoking `schemathesis run …` manually.
4. **Run suites**
   - Schemathesis: `npm run docs:openapi:generate && npm run test:contract:schemathesis:local`
5. **CI parity**  
   The `tests` and `contract_local` jobs already set `DISABLE_RATE_LIMITING=true` and extract the same token in `backend-ci.yml`. If a contract job fails, inspect the artifacts under `tests/contract/schemathesis/reports/**`, review `tmp/backend-contract.log`, and mirror `npm run contract:local:full` locally (adjust `CONTRACT_LOCAL_PORT` if needed) for parity.

### Validation expectations during contract runs

- JSON bodies must be valid objects. Sending `""`, `0`, or `null` now triggers the shared guard middleware with a structured `400` before the request reaches Zod; treat that as the expected outcome rather than a crash.
- Metric settings enforce conditional fields. When you turn on `goalEnabled`, also set `goalType` + `goalValue`; when you flip `timeFrameEnabled`, include both `startDate` and `deadlineDate`. The OpenAPI spec mirrors this via `oneOf`.
- Cursor list endpoints (`/metrics`, `/metric-settings`, `/metric-logs`, `/metric-categories`) reject blank `q` values and unexpected `filter[...]` keys. Schemathesis reports of “valid data rejected” for those parameters are usually expected 400s.

## 8. Escalation & Support

- **Docs**: `docs/how-to/testing/`, `docs/reference/ci-pipeline/`, `docs/internal/initiatives/**`.
- **Owner**: Backend Platform (@dimaspramudya). Reach out for CI failures or infrastructure issues.
- **Incident logging**: If an issue reaches `main`/production, record it in `docs/internal/incidents/` with root cause and remediation steps.

Consistently following these steps demonstrates production-grade discipline and builds a strong portfolio narrative around CI/CD ownership.
