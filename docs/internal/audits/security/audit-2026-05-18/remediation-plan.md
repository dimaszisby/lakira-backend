# Remediation Plan - 2026-05-18

- Generated (UTC): 2026-02-18T11:04:09Z

| remediation_id   | finding_id       | action                                                                                           | owner            | priority | target_date | status  | verification_evidence                                                                                                                                                              |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------ | ---------------- | -------- | ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REM-20260518-001 | SEC-20260518-001 | Keep role assignment server-controlled and blocked from public profile/register mutation paths   | backend-security | Critical | 2025-11-22  | Done    | `src/features/auth/infrastructure/http/schema.zod.ts`, `src/features/auth/application/use-cases/RegisterUser.ts`, `docs/internal/audits/security/audit-2026-02-18/findings-log.md` |
| REM-20260518-002 | SEC-20260518-002 | Keep strict owner checks for metric/log/settings resources and non-owner denial behavior         | backend-security | Critical | 2025-11-22  | Done    | `src/utils/db-helper.ts`, `docs/internal/audits/security/audit-2026-02-18/findings-log.md`                                                                                         |
| REM-20260518-003 | SEC-20260518-003 | Keep docs auth guard default enabled outside local diagnostics                                   | backend-security | High     | 2025-11-28  | Done    | `src/server.ts`, `src/config/zodEnv.ts`, `docs/internal/audits/security/audit-2026-02-18/findings-log.md`                                                                          |
| REM-20260518-004 | SEC-20260518-004 | Keep CORS method allowlist synchronized with active HTTP verbs                                   | backend-platform | Medium   | 2026-03-20  | Done    | `src/server.ts`, `src/features/metric-settings/infrastructure/http/router.ts`, `tmp/security/security-delta-report.json`                                                           |
| REM-20260518-005 | SEC-20260518-005 | Maintain monthly dependency hygiene and verify quarterly production audit snapshot remains clean | backend-platform | Medium   | 2026-05-18  | Planned | `docs/reference/security/dependency-policy.md`, `tmp/security/npm-audit-production.json`, `tmp/security/security-delta-report.json`                                                |
| REM-20260518-006 | SEC-20260518-006 | Re-run full quarterly evidence refresh on the audit date and confirm gate remains non-blocking   | backend-security | Low      | 2026-05-18  | Planned | `tmp/security/security-delta-report.json`, `tmp/security/security-gate-result.json`, `docs/internal/audits/security/audit-2026-05-18/audit-checklist.md`                           |

## SLA Targets

- Critical: mitigation plan within 24h
- High: mitigation plan within 7 days
- Medium: mitigation plan within 30 days
- Low: planned backlog within 90 days

## Status Snapshot

- Open remediation actions: 2 (`REM-20260518-005`, `REM-20260518-006`)
- Both open actions are planned quarterly refresh tasks, not unresolved high/critical vulnerabilities.

## Definition of Done

- Every open finding has action, owner, and target date.
- Verified/done actions include concrete evidence references.
