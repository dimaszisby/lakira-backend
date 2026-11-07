# Security Scripts Usage Guide (Junior Friendly)

## Purpose

This guide is a practical command playbook for the security framework scripts.

Use these commands from repo root.

## Prerequisites

- Node dependencies installed (`npm ci`).
- You are at repository root.
- `docs/reference/security/ci-gate-policy.json` exists.

## Script Overview

Scripts live in `scripts/security/` and are exposed in `package.json`:

- `npm run security:audit:init`
- `npm run security:delta:check`
- `npm run security:gate:evaluate`
- `npm run security:delta:gate`
- `npm run test:unit:security-framework`

## 1. Initialize A New Audit Run

Create a full audit doc kit for a specific date:

```bash
npm run security:audit:init -- --date 2026-03-01
```

Expected result:

- New folder created: `docs/internal/audits/security/audit-2026-03-01/`
- All required markdown artifacts generated.

If folder already exists and you want to overwrite template targets:

```bash
npm run security:audit:init -- --date 2026-03-01 --force
```

## 2. Run Security Delta Checks

Run dependency + static guardrail checks and write machine-readable output:

```bash
npm run security:delta:check -- --output tmp/security/security-delta-report.json --audit-raw tmp/security/npm-audit-production.json
```

Outputs:

- `tmp/security/security-delta-report.json`
- `tmp/security/npm-audit-production.json`

## 3. Evaluate CI Gate Policy

Evaluate findings against soft-gate rules:

```bash
npm run security:gate:evaluate -- --input tmp/security/security-delta-report.json --policy docs/reference/security/ci-gate-policy.json --output tmp/security/security-gate-result.json
```

Output:

- `tmp/security/security-gate-result.json`

Behavior:

- Exit code `0`: pass
- Exit code `1`: blocked (usually unresolved High/Critical)

## 4. Run Delta + Gate Together

Shortcut command:

```bash
npm run security:delta:gate
```

Use this before creating PRs that touch security-sensitive code.

## 5. Validate Framework Test Cases

Run the reusable framework validation suite (template completeness, schema conformance, and gate-policy simulation):

```bash
npm run test:unit:security-framework
```

Use this whenever you change:

- `scripts/security/*`
- `docs/reference/security/audit-run-template/*`
- `docs/reference/security/ci-gate-policy.json`

## How To Read Results Quickly

From `tmp/security/security-delta-report.json`:

- `summary.totalFindings`
- `summary.severityCounts`
- `summary.unresolvedHighCritical`

From `tmp/security/security-gate-result.json`:

- `passed`
- `blockingFindings[]`
- `backlogWarnings[]`

## Recommended Junior Workflow

1. Initialize audit run folder.
2. Run delta checks.
3. Run gate evaluation.
4. Copy findings into `findings-log.md` with owner/SLA.
5. Create/update `remediation-plan.md`.
6. Re-run delta+gate after fixes.
7. Update `metrics-tracker.md`, `decisions.md`, and `audit/index.md`.

## Troubleshooting

### Error: invalid or missing date

Cause: date not in `YYYY-MM-DD`.

Fix:

```bash
npm run security:audit:init -- --date 2026-03-01
```

### Gate fails on High/Critical

Cause: unresolved high/critical findings.

Fix:

- Remediate finding, then re-run `npm run security:delta:gate`.
- If truly temporary, use formal exception process from `docs/reference/security/security-exceptions-policy.md`.

### No output file generated

Cause: wrong path or command failed early.

Fix:

- Confirm script output path arguments.
- Check command stderr.
- Re-run from repo root.

## Safe Practices

- Do not edit gate policy ad-hoc to force passing CI.
- Do not mark findings as fixed without rerunning scripts.
- Do not put secrets or exploit payload details in `portfolio-summary.md`.

## Related Docs

- Junior framework overview: `docs/how-to/security/security-framework-junior-guide.md`
- Framework lifecycle: `docs/reference/security/security-audit-framework.md`
- Master checklist: `docs/reference/security/security-audit-master-checklist.md`
