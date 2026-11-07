# Security Audit Metrics Tracker - 2026-02-18

| Metric                               | Target                                              | Baseline                       | Current                    | Owner            | Next Action                                           |
| ------------------------------------ | --------------------------------------------------- | ------------------------------ | -------------------------- | ---------------- | ----------------------------------------------------- |
| Critical findings open               | 0                                                   | N/A (framework v1 initial run) | 0                          | backend-security | Keep zero in next delta run                           |
| High findings open                   | 0                                                   | N/A (framework v1 initial run) | 0                          | backend-security | Keep high findings at zero through next release cycle |
| Medium findings open                 | <=2 with owners/dates                               | N/A                            | 0                          | backend-platform | Keep dependency hygiene in monthly maintenance        |
| Low findings open                    | Backlog with dates                                  | N/A                            | 0                          | backend-platform | Keep dependency hygiene in monthly maintenance        |
| CI gate pass rate                    | 100% for compliant runs                             | N/A                            | 100% (current run passing) | backend-security | Keep pre-PR `security:delta:gate` habit               |
| Evidence completeness                | 100% findings mapped to controls + evidence         | N/A                            | 100%                       | backend-security | Maintain in next cycle                                |
| Automated security artifact coverage | Delta report + gate result + npm audit raw produced | N/A                            | 100% (`tmp/security/*`)    | backend-security | Keep artifact upload in CI                            |

## Current Snapshot Source

- `tmp/security/security-delta-report.json`
- `tmp/security/security-gate-result.json`
- `tmp/security/npm-audit-production.json`

## Definition of Done

- Metrics stay aligned with latest findings and remediation statuses.
- Any metric drift is reflected in follow-up actions and owners.
