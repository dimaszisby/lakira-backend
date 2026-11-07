# Security Framework Junior Guide

## Purpose

This guide explains the Lakira backend security framework in plain language for junior or newer developers.

Use this first, then read detailed docs in `docs/reference/security/`.

## What This Framework Is

The framework is a repeatable way to run security audits so we do not rely on memory or one-off docs.

It standardizes:

- what to check
- how to record findings
- how to prioritize fixes
- how CI blocks serious unresolved risks

## Core Concepts (Quick Glossary)

- Audit run: One security review cycle, stored as `docs/internal/audits/security/audit-YYYY-MM-DD/`.
- Finding: A concrete security issue with severity, owner, SLA due date, and evidence.
- Control: A required security expectation (auth, input validation, CORS, dependency hygiene, etc.).
- Evidence: File refs, command output, and report artifacts proving a finding exists or is fixed.
- Soft gate: CI fails only for unresolved High/Critical findings.

## Folder Map You Need To Know

- Program entrypoint: `docs/reference/security/README.md`
- Framework rules: `docs/reference/security/`
- Reusable templates: `docs/reference/security/audit-run-template/`
- Audit history: `docs/internal/audits/security/index.md`
- Dependency policy: `docs/reference/security/dependency-policy.md`

## Audit Cadence

- Full audit: quarterly
- Delta audit: before production releases
- Extra delta audit: after security incidents or major architecture changes

## Required Files In Every Audit Run

Each audit run folder must include:

- `README.md`
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

## How A Typical Audit Flows

1. Prepare

- Initialize a new run folder from templates.
- Confirm scope and standards baseline.

2. Assess

- Run automated checks.
- Review critical code/config paths.

3. Validate

- Reproduce issues and attach evidence.

4. Report

- Update findings, control matrix, and threat model.

5. Remediate

- Assign owners and target dates.

6. Verify

- Re-run checks and confirm fixes.

7. Close

- Update index and carry unresolved medium/low items forward.

## Severity and SLA Rules

- Critical: mitigation plan within 24h
- High: mitigation plan within 7 days
- Medium: mitigation plan within 30 days
- Low: planned backlog within 90 days

## What Juniors Should Always Do

- Always include evidence for every finding.
- Always map findings to controls and standards references.
- Always set owner + target date for open findings.
- Always keep docs and script outputs in sync.
- Always run `npm run test:unit:security-framework` after changing security templates/scripts/policy.

## Common Mistakes To Avoid

- Creating an audit folder without ISO date format (`audit-YYYY-MM-DD`).
- Logging a finding without evidence or owner.
- Marking a finding fixed without re-running checks.
- Publishing sensitive details in `portfolio-summary.md`.

## Where To Go Next

- Script commands and examples: `docs/how-to/security/run-a-security-audit.md`
- Deep framework lifecycle: `docs/reference/security/security-audit-framework.md`
- Gate behavior: `docs/reference/security/ci-gate-policy.json`
