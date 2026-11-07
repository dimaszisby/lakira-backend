# Lakira – CI/CD Strategy

## 1. Purpose & Scope

This document describes the **Continuous Integration / Continuous Delivery (CI/CD) strategy** for the Lakira project (Frontend + Backend).

Goals:

- Provide a **clear, consistent pipeline model** that can be understood by contributors, AI agents (Codex), and reviewers/interviewers.
- Ensure that every change to the codebase is:
  - Built,
  - Tested,
  - Validated against API contracts,
  - Deployed to a predictable environment,
    before being considered “ready to consume”.
- Keep the strategy realistic for a **single-developer portfolio project**, while reflecting **production-grade practices**.

> Special Note for Codex: When asked “how is CI/CD structured for Lakira?” or when generating pipeline definitions, use this file as the root reference and then drill into the backend docs in `docs/reference/ci-pipeline/` and the (archived) frontend docs under `docs/internal/archive/frontend/ci-cd/**`.

---

## 2. CI/CD Principles

1. **Pipelines as Code**
   - All CI/CD logic is defined via configuration files in the repo:
     - GitHub Actions workflows (`.github/workflows/*.yml`).
     - Optional Jenkins pipeline (`Jenkinsfile`) for experiments.
   - No hidden manual steps for core flows.

2. **Testing Pyramid Before Deployment**
   - Code must pass:
     - Static checks (lint, typecheck),
     - Unit tests,
     - Integration tests,
     - Contract tests (for FE-facing APIs),
       before deployment to staging/production.

3. **Small, Fast, Frequent**
   - Pipelines should be fast enough to run on:
     - Every push to `main`/`dev`/`staging` and to working branches,
     - Every pull request.
   - Encourage small PRs and frequent merges.

4. **Environment Parity for Staging**
   - Staging should mirror production as closely as reasonable (same Docker image / runtime platform).
   - Contract tests run against staging.

5. **Safe & Observable Deployments**
   - Use environment variables for secrets.
   - Emit logs and test reports (JUnit/HTML) that can be inspected for each build.
   - Avoid “magic” manual deployments without a record.

6. **Cost-Aware for a Hobby Project**
   - Prefer **managed PaaS + GitHub Actions** for the primary path:
     - Lower operational overhead,
     - Little or no recurring cost.
   - Use self-hosted Jenkins on a small VPS **only** as a short-term learning/portfolio exercise.

---

## 3. Tooling Overview

- **Source Control:** GitHub
- **Primary CI Engine:** GitHub Actions
- **Optional CI Engine:** Jenkins (short-lived, self-hosted for learning)
- **Backend Deploy Target:** Managed PaaS (Render) today; [ADR-0042](../../explanation/decisions/adr-0042-vps-compose-deployment-topology.md) (Accepted 2026-09-15, not yet implemented) moves staging and production to a VPS running Docker Compose
- **Frontend Deploy Target:** Vercel
- **Artifacts:**
  - Jest test reports (optional).
  - Schemathesis contract test reports (JUnit + HAR).
  - Build artifacts (Docker images, or platform-specific bundles).

> Special Note for Codex: Prefer GitHub Actions as the default CI implementation. Only reference Jenkins for the optional `JENKINS_NOTES.md` scenarios.

---

## 4. Pipeline Stages (Generic)

Standard pipeline stages (applies to both FE and BE, with variations):

1. **Checkout & Setup**
2. **Static Checks**
   - Lint
   - Typecheck
3. **Unit Tests**
4. **Integration Tests**
5. **Build**
6. **Deploy to Staging**
7. **Contract Tests (Staging) – BE**
   - Smoke suite against the deployed staging backend.
8. **E2E Tests (Optional)**
9. **Manual Approval or Auto-Deploy to Production (Optional)**

Each service (BE/FE) has its own implementation details, described in:

- `docs/reference/ci-pipeline/pipeline-overview.md`
- `docs/internal/archive/frontend/ci-cd/README.md`

---

## 5. Branching & Trigger Strategy

### 5.1 Back-End Backend (API)

- **Branches:**
  - `main` – stable, production-ready.
  - `staging` – release candidate, deployed to staging.
  - `dev` – integration branch; every work branch targets it.
  - `<type>/<slug>` (`feat/`, `fix/`, `docs/`, `chore/`, `ci/`, `refactor/`) – short-lived work
    branches. Promotion is `<type>/* → dev → staging → main`.

- **Triggers:**
  - On push to `main`, `dev`, `staging`, and any work-branch prefix above.
  - On pull requests targeting `main`, `dev` or `staging`.

- **Required checks for PR merge:**
  - GitHub Actions backend CI workflow:
    - Static checks (lint, typecheck)
    - Unit tests
    - Integration tests
    - Contract tests (local/staging, once implemented)

### 5.2 Frontend (Next.js)

- Similar pattern, with FE-specific pipeline:
  - Static checks (lint, typecheck),
  - Unit/component tests,
  - Integration/E2E (Cypress/Playwright),
  - Build & deploy to Vercel Preview,
  - Optional Lighthouse/web-vitals checks.

(Details to be expanded in `docs/internal/archive/frontend/ci-cd/README.md`.)

---

## 6. Environments

Logical environments:

- **Local**
  - Developer machines, Docker Compose.
  - All tests can run here.

- **Staging**
  - Managed PaaS (backend) + Vercel Preview (frontend).
  - Target for contract tests.
  - Uses test/synthetic data.

- **Production**
  - A `deploy_production` CI job exists (runs on `main`), but no production service is provisioned.
  - Per ADR-0042 it will run on the same VPS topology as staging, not on Render.

Detailed environment URLs, config, and secrets are captured in:

- `docs/reference/environments.md`
- `docs/internal/archive/frontend/ci-cd/ENVIRONMENTS_MATRIX.md` (optional)

---

## 7. Backend CI/CD Docs

Backend-specific CI/CD docs:

```text
docs/reference/ci-pipeline/          reference (this folder)
  strategy.md
  pipeline-overview.md
  workflow-guidelines.md
docs/reference/environments.md       environment matrix
docs/internal/initiatives/ci-pipeline/   working plan and checklist
docs/internal/archive/JENKINS_NOTES.md   archived Jenkins experiment
```

---

## 8. Frontend CI/CD Docs

Frontend-specific docs live under:

```text
docs/internal/archive/frontend/ci-cd/
  README.md
  GITHUB_ACTIONS_PIPELINE_PLAN.md
  GITHUB_ACTIONS_PIPELINE_CHECKLIST.md
  ENVIRONMENTS_MATRIX.md
```

> Special Note for Codex: The frontend workflow lives in the lakira-frontend repository, not here; these archived docs are background only.

---

## 9. Security, Compliance, and Reliability Gates

To align Lakira with modern production expectations (and to strengthen portfolio value), CI/CD should include basic **security and compliance checks**:

1. **Dependency & Vulnerability Scanning**
   - Enable GitHub **Dependabot** for npm dependencies.
   - Enable GitHub **Dependency Review** so PRs surface vulnerable packages before merge.
   - The `security_delta` job runs the security framework tests, `npm run security:delta:check` and
     the gate evaluation; Critical/High findings fail the pipeline.

2. **Secret Scanning**
   - Enable GitHub **secret scanning** and **push protection** for the repository.
   - Never commit `.env` files with real secrets.

3. **Static Application Security Testing (SAST)**
   - (Optional but recommended) Use **GitHub CodeQL** workflow for Node.js/TypeScript.
   - Treat CodeQL findings as part of PR review for backend.

4. **SBOM & Supply Chain (Future/Advanced)**
   - Future improvement: generate a **Software Bill of Materials (SBOM)** using tools like CycloneDX for Node.
   - Optionally sign and attach SBOM artifacts to releases.

5. **Automated Verification & Rollback Hooks (Conceptual)**
   - Staging deploys are considered “good” only after:
     - Health checks succeed, and
     - The staging smoke suite (`smoke_staging`) passes.
   - Rollback strategy for a portfolio project:
     - Re-deploy the last known good commit to staging (via Render deploy hook tied to that SHA).
     - Document the last green run and commit SHA used as the “release baseline”.

> Special Note for Codex: When proposing new pipeline jobs, consider whether they belong in the **security gate** stage (e.g. CodeQL, npm audit) and reference this section.
