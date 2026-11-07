# Security Audit Plan - {{AUDIT_DATE}}

- Generated (UTC): {{GENERATED_AT_UTC}}
- Scope: Backend code, dependencies, CI/CD, runtime hardening
- Baseline: OWASP ASVS L2, OWASP Top 10, NIST SSDF

## Objectives

1. Identify exploitable security gaps and control drift.
2. Validate effectiveness of existing controls.
3. Produce actionable remediation and clear ownership.

## In Scope

- API/auth/authz/input controls
- Configuration and environment hardening
- Dependency and supply-chain posture
- Security CI gate behavior

## Out of Scope

- Frontend-only flows
- External compliance-only attestations

## Work Phases

1. Prepare and gather evidence
2. Execute checklist and automated delta checks
3. Threat/control/finding synthesis
4. Remediation and gate verification
5. Portfolio-safe summary publication

## Acceptance Criteria

- All required artifacts completed.
- Findings mapped to framework controls and standards.
- Critical/high findings resolved or validly exception-approved.

## Definition of Done

- Plan sections fully populated for the current run.
- Scope and acceptance criteria align with `audit-checklist.md` and `findings-log.md`.
