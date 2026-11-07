# Audit Run Template Kit

## Purpose

This template kit initializes a complete security audit run folder under:

`docs/internal/audits/security/audit-YYYY-MM-DD`

## Required Files

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

## Naming and Timestamp Standards

- Audit folder names must use ISO date format: `audit-YYYY-MM-DD`.
- Generated timestamps must use UTC ISO format, for example: `2026-02-18T09:30:00Z`.

## Initialization

Use:

`node scripts/security/init-audit-doc-kit.mjs --date YYYY-MM-DD`

## Link Conventions

- File references must use repo-relative paths with line anchors when possible.
- Command evidence should reference artifact paths under `tmp/security/` or the current audit folder.
- Finding IDs should follow: `SEC-YYYYMMDD-###`.

## Definition of Done

An initialized run is valid when all required files exist and placeholders are replaced with real audit metadata.
