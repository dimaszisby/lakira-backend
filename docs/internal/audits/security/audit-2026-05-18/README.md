# Security Audit Run - 2026-05-18

- Generated (UTC): 2026-02-18T11:04:09Z
- Scope: Backend codebase, dependencies, CI/CD, runtime hardening
- Baseline: OWASP ASVS L2, OWASP Top 10, NIST SSDF

## Audit Status

- Current state: Planned (quarterly run scheduled for 2026-05-18; package pre-filled on 2026-02-18)
- Gate status: Precheck Pass (2026-02-18 snapshot has 0 unresolved high/critical)

## Summary

This folder is the Q2 2026 quarterly audit package.

Current progress as of 2026-02-18:

- Historical findings from 2025-11-21 and 2026-02-18 reconciled into normalized schema.
- Current automated precheck executed:
  - `npm run security:delta:gate`
  - `npm run test:unit:security-framework`
- Evidence artifacts generated:
  - `tmp/security/security-delta-report.json`
  - `tmp/security/security-gate-result.json`
  - `tmp/security/npm-audit-production.json`

## Artifact Index

- [Audit Plan](./audit-plan.md)
- [Audit Checklist](./audit-checklist.md)
- [Threat Model](./threat-model.md)
- [Control Matrix](./control-matrix.md)
- [Findings Log](./findings-log.md)
- [Remediation Plan](./remediation-plan.md)
- [Decisions](./decisions.md)
- [Incidents](./incidents.md)
- [Metrics Tracker](./metrics-tracker.md)
- [Portfolio Summary](./portfolio-summary.md)

## Scope Notes

- In scope: API/auth/authz/input controls, runtime/config hardening, dependency posture, CI security gates.
- Out of scope: frontend-only flows, sector-specific compliance attestation, production penetration testing.

## Definition of Done

- All required artifacts are present and internally consistent.
- No unresolved high/critical findings at audit sign-off, or documented accepted exceptions with expiry.
- Audit-week evidence refresh is completed in the 2026-05-18 execution window.
