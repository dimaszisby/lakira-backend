# Security Release Delta SOP (Pre-Production)

## Purpose

Define the required security checks and documentation updates before any production release or hotfix deployment.

This SOP is mandatory for backend release readiness.

## When To Run

Run this SOP when:

- Releasing to production (`main` or production tag flow).
- Shipping a hotfix directly affecting backend behavior.
- Merging security-sensitive changes (auth/authz, secrets, rate limiting, CI security scripts/policies).

## Required Owners

- Driver: PR author or release owner.
- Reviewer: code owner from `.github/CODEOWNERS`.
- Approver: backend lead/release approver.

## Pre-Run Prerequisites

1. Ensure Node is `24.x`.
2. Pull latest target branch and install dependencies.
3. Ensure local `.env` values are valid for test/security scripts.

## Mandatory Commands

Run in repository root:

```bash
npm run test:unit:security-framework
npm run security:delta:gate
```

Expected artifacts:

- `tmp/security/security-delta-report.json`
- `tmp/security/security-gate-result.json`
- `tmp/security/npm-audit-production.json`

## Gate Decision Rules

- Pass condition: `blocking=0` in `tmp/security/security-gate-result.json`.
- Block condition: any unresolved High/Critical finding.
- Medium/Low findings: non-blocking but must have owner + target date in remediation tracking.

If blocked:

1. Remediate and re-run commands.
2. If temporary acceptance is required, follow `docs/reference/security/security-exceptions-policy.md` and document in run-level `decisions.md`.

## Required Documentation Updates

For each release delta check, update the active run in `docs/internal/audits/security/`:

1. `audit-checklist.md`
2. `findings-log.md`
3. `remediation-plan.md`
4. `metrics-tracker.md`
5. `portfolio-summary.md` (sanitized)

If no active run exists for the current cycle, initialize one:

```bash
npm run security:audit:init -- --date YYYY-MM-DD
```

## PR Requirements For Release

- Security checklist in `.github/pull_request_template.md` is fully checked.
- CI `security_delta` job must pass.
- Security artifacts are available from CI upload (`backend-security-delta`) or attached references.
- Any open exception includes approver, rationale, and expiry.

## Branch Protection Baseline (GitHub Settings)

For protected release branches, enforce:

1. Required status checks: `checks`, `security_delta`, `tests`.
2. Require pull request review before merging.
3. Require review from Code Owners.
4. Dismiss stale approvals when new commits are pushed.

## Quick Runbook

```bash
npm run test:unit:security-framework && npm run security:delta:gate
```

Then update audit docs and open PR with evidence links.
