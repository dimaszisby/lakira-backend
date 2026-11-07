# Security Audit Framework - Lakira Backend

## Purpose

Provide a reusable, decision-complete framework that standardizes how security audits are prepared, executed, scored, and reported.

## Lifecycle

1. Prepare

- Define audit scope, systems, and release context.
- Initialize the audit doc kit from templates.
- Confirm baseline standards and policy versions.

2. Assess

- Run automated checks (dependency scan, static guardrail scan, contract/fuzz security checks).
- Perform architecture and trust-boundary analysis.
- Execute checklist-driven code and config review.

3. Validate

- Reproduce findings and confirm impact.
- Attach concrete evidence references (file/line, command output, report artifact).
- Remove false positives with explicit rationale.

4. Report

- Publish `findings-log.md`, `threat-model.md`, and `control-matrix.md`.
- Assign owners and SLA due dates.
- Publish sanitized `portfolio-summary.md`.

5. Remediate

- Convert findings into actionable remediation tasks.
- Track status in `remediation-plan.md`.
- Record accepted risks via exceptions policy.

6. Verify

- Re-run automated checks and targeted manual checks.
- Move findings to verified only when evidence proves closure.

7. Close

- Finalize metrics and decisions logs.
- Update `docs/internal/audits/security/index.md`.
- Carry unresolved medium/low findings into the next cycle backlog.

## Required Audit Artifacts

Every audit run folder must contain:

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

## Control Mapping Rule

Each finding must map to at least one reference from:

- OWASP ASVS
- OWASP Top 10
- NIST SSDF

and at least one internal control ID from `security-audit-master-checklist.md`.

## Definition of Done

An audit cycle is complete only when:

- All required artifacts are present and internally consistent.
- Critical/high findings are resolved or explicitly exception-approved.
- CI gate evaluation report is attached.
- Portfolio summary is published without sensitive implementation details.
