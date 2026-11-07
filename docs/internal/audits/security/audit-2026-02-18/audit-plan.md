# Security Audit Plan - 2026-02-18

- Generated (UTC): 2026-02-18T08:36:30Z
- Scope: Backend code, dependencies, CI/CD, runtime hardening
- Baseline: OWASP ASVS L2, OWASP Top 10, NIST SSDF

## Objectives

1. Establish a repeatable audit execution model with standardized artifacts.
2. Reconcile 2025-11-21 findings against current code state.
3. Run machine-readable delta checks and enforce soft gate policy.
4. Produce both internal and sanitized portfolio outputs.

## In Scope

- Auth/authz, input handling, API config hardening
- Dependency risk and remediation posture
- CI security gate policy and automation output
- Runtime defaults and environment hardening controls

## Out of Scope

- Frontend-only controls
- Sector-specific compliance-only controls

## Execution Plan

1. Framework bootstrap

- Create framework docs, control catalog, scoring model, evidence and exception policies.

2. Template and automation bootstrap

- Create reusable template kit.
- Implement `init-audit-doc-kit`, `security-delta-check`, `evaluate-gate` scripts.

3. CI integration

- Add `security_delta` job in `.github/workflows/backend-ci.yml`.
- Upload security artifacts under `tmp/security/*`.

4. Audit run execution

- Generate `audit-2026-02-18` from templates.
- Populate threat model, control matrix, findings, remediation, and summary docs.

## Acceptance Criteria

- Required run artifacts complete under `docs/internal/audits/security/audit-2026-02-18`.
- Findings mapped to controls and standards references.
- Gate evaluation is reproducible from scripts and policy file.

## Assumptions

- Backend-only scope for this repository.
- Dynamic baseline remains Newman + Schemathesis; ZAP is deferred.
- Existing dependency policy remains authoritative and is referenced, not replaced.

## Definition of Done

- Plan execution reflected in files, scripts, and workflow updates.
- Open findings carry owners, SLA due dates, and target fix versions.
