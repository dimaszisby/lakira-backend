# Security Audit Workflow (Branch Model: dev -> staging -> main)

## Purpose

Define the standard step-by-step workflow for running and recording security audits in this repository.

This guide explains:

- why audits must be run and recorded on specific branches
- what to run in each phase
- what artifacts to produce
- what documents to update for traceability

## Core Principle

Security evidence must match the exact code that is promoted.

- `dev` evidence is for early detection.
- `staging` evidence is for release decision.
- `main` is only promoted after `staging` evidence and checks are green.

## Branch Responsibilities

1. `dev`

- Run security checks during feature development and PRs.
- Fix issues as early as possible.
- Do not use `dev` evidence alone for production release sign-off.

2. `staging`

- Run release security delta checks on the release candidate.
- Record results in the active audit run folder under `docs/internal/audits/security/`.
- Use this branch as final security sign-off input before promotion.

3. `main`

- Receive only reviewed and validated changes from `staging`.
- Keep merge evidence in PR history and audit artifacts.

## Workflow A: Continuous Security Checks on `dev`

1. Sync your branch:

```bash
git fetch origin
git checkout dev
git pull origin dev
```

2. Use Node 24 and install dependencies:

```bash
nvm use          # reads .nvmrc
npm ci
```

3. Run security checks:

```bash
npm run test:unit:security-framework
npm run security:delta:gate
```

4. If failed:

- inspect `tmp/security/security-gate-result.json`
- inspect `tmp/security/security-delta-report.json`
- remediate and re-run until `blocking=0`

5. Open PR to target branch with evidence summary in PR description.

## Workflow B: Release Delta Sign-Off on `staging` (Mandatory)

Run this before opening `staging -> main` PR.

1. Sync `staging`:

```bash
git fetch origin
git checkout staging
git pull origin staging
```

2. Prepare environment:

```bash
nvm use          # reads .nvmrc
npm ci
export NODE_ENV=test
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/lakira_ci
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=postgres
export DB_NAME=lakira_ci
export JWT_SECRET=security-delta-local-placeholder
export REDIS_REQUIRED=false
export DISABLE_RATE_LIMITING=true
```

3. Execute release security delta:

```bash
npm run test:unit:security-framework
npm run security:delta:gate
```

4. Pass criteria:

- `tmp/security/security-gate-result.json` has `"passed": true`
- `tmp/security/security-gate-result.json` has `"blocking": 0`

5. If blocked:

- remediate high/critical findings first
- re-run commands
- only use exception flow if required by `security-exceptions-policy.md`

## Record the Snapshot in Audit Artifacts

After successful run on `staging`, update the active audit run folder:

`docs/internal/audits/security/audit-YYYY-MM-DD/`

Required updates:

1. `README.md`

- latest run timestamp (UTC)
- current gate status
- summary counts (critical/high/medium/low)

2. `audit-checklist.md`

- mark relevant controls as `PASS` or `PRECHECK`
- add evidence references from `tmp/security/*`

3. `findings-log.md`

- record whether new findings exist
- ensure status/owner/SLA fields are complete

4. `remediation-plan.md`

- map open findings to owner and target date
- keep historical remediations intact

5. `metrics-tracker.md`

- set latest current metrics from this run

6. `portfolio-summary.md`

- add sanitized release-ready narrative
- do not include secrets, internal exploit details, or sensitive endpoints

## Quarterly Full Audit Workflow

Use this for scheduled quarterly audits.

1. Initialize run (if not created):

```bash
npm run security:audit:init -- --date YYYY-MM-DD
```

2. Complete all required artifacts:

- `audit-plan.md`
- `audit-checklist.md`
- `threat-model.md`
- `control-matrix.md`
- `findings-log.md`
- `remediation-plan.md`
- `decisions.md`
- `incidents.md`
- `metrics-tracker.md`
- `portfolio-summary.md`
- `README.md`

3. Run security evidence commands:

```bash
npm run test:unit:security-framework
npm run security:delta:gate
```

4. Reconcile historical findings and carry-over items.

5. Update `docs/internal/audits/security/index.md` status and highlights.

## PR and Merge Requirements

For release-related PRs:

1. Use `.github/pull_request_template.md`.
2. Complete Security Checklist entries.
3. Ensure CI required checks are green:

- `checks`
- `security_delta`
- `tests`

4. Ensure Code Owners review is present for security-owned paths.

## Common Mistakes to Avoid

1. Running checks only on `dev` and using that as final release evidence.
2. Forgetting to update audit docs after a passing staging run.
3. Treating `npm ci` warning output as gate failure evidence.
4. Running `npm audit fix --force` without review and evidence.
5. Publishing sensitive details in portfolio-facing summary docs.

## Reference Documents

- `docs/reference/security/README.md`
- `docs/reference/security/security-audit-framework.md`
- `docs/reference/security/security-audit-master-checklist.md`
- `docs/reference/security/security-exceptions-policy.md`
- `docs/reference/security/ci-gate-policy.json`
- `docs/how-to/security/release-delta-sop.md`
- `docs/how-to/ci-cd/daily-pipeline-playbook.md`
