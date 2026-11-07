# Security Audit Index

This index tracks all Lakira backend security audit runs and their follow-up status.

## Audit Runs

| Audit Date | Folder                                           | Type                             | Status                   | Highlights                                                                                                                          |
| ---------- | ------------------------------------------------ | -------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2025-11-21 | `docs/internal/audits/security/audit-2025-11-21` | Baseline + feature deep dive     | Completed (historical)   | Identified and documented major authz, API surface, and config hardening issues; multiple mitigations captured in control matrix.   |
| 2026-02-18 | `docs/internal/audits/security/audit-2026-02-18` | Framework-driven full audit (v1) | Completed                | Introduced reusable framework/templates/scripts, executed delta checks, and closed in-cycle findings with passing soft-gate.        |
| 2026-05-18 | `docs/internal/audits/security/audit-2026-05-18` | Framework-driven quarterly audit | Planned (precheck ready) | Run package pre-filled on 2026-02-18 with reconciled findings and passing security precheck snapshot; audit-week execution pending. |

## Cadence Policy

- Full security audit every quarter.
- Delta audit required before production releases.
- Additional delta audit after security incidents or major architecture shifts.

## Maintenance Expectations

- Update framework docs when controls, standards mappings, or gate policy changes.
- Keep findings/remediation status current for active audit runs.
- Record security exceptions with expiry and approval in the run-level `decisions.md`.
- Carry unresolved medium/low findings into subsequent cycles with explicit target dates.
