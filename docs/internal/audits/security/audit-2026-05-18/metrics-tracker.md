# Security Audit Metrics Tracker - 2026-05-18

| Metric                           | Target                                              | Baseline (2026-02-18 run) | Current (2026-02-18 precheck) | Owner            | Next Action                                         |
| -------------------------------- | --------------------------------------------------- | ------------------------- | ----------------------------- | ---------------- | --------------------------------------------------- |
| Critical findings open           | 0                                                   | 0                         | 0                             | backend-security | Preserve zero during 2026-05-18 execution           |
| High findings open               | 0                                                   | 0                         | 0                             | backend-security | Preserve zero during 2026-05-18 execution           |
| Medium findings open             | <=2 with owner/date                                 | 0                         | 0                             | backend-platform | Re-validate in audit week                           |
| Low findings open                | Backlog tracked with target dates                   | 0                         | 0                             | backend-platform | Re-validate in audit week                           |
| Time-to-mitigate (Critical/High) | Within SLA (24h/7d)                                 | Met                       | Met                           | backend-security | Keep immediate triage workflow active               |
| CI gate pass rate                | 100% for compliant runs                             | 100%                      | 100%                          | backend-security | Keep `security_delta` workflow healthy              |
| Evidence completeness            | 100% findings mapped to controls and remediation    | 100%                      | 100%                          | backend-security | Maintain artifact links as findings evolve          |
| Security artifact generation     | Delta + gate + npm audit raw produced per execution | 100%                      | 100%                          | backend-security | Re-generate artifacts in quarterly execution window |

## Current Snapshot Source

- `tmp/security/security-delta-report.json`
- `tmp/security/security-gate-result.json`
- `tmp/security/npm-audit-production.json`
- `docs/internal/audits/security/audit-2026-05-18/findings-log.md`

## Definition of Done

- Metrics reflect latest known snapshot and are traceable to evidence.
- Any drift is reflected in findings/remediation updates.
