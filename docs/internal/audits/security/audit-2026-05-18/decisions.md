# Security Audit Decisions - 2026-05-18

## ADR-SEC-20260518-001 - Pre-fill Future-Dated Quarterly Run Package (Accepted 2026-02-18)

- Context: The quarterly audit date is 2026-05-18, but waiting until that date increases drift risk and weakens traceability.
- Decision: Pre-fill all required run artifacts now using current evidence and clearly mark audit state as planned/precheck.
- Options Considered:
  - Create placeholders only and defer all content until audit date.
  - Pre-fill reconciled and evidence-backed baseline now (chosen).
- Consequences:
  - Better continuity and less context loss before execution week.
  - Requires explicit status labeling to avoid overstating future audit completion.
- Related finding IDs: SEC-20260518-006
- Links: `docs/internal/audits/security/audit-2026-05-18/README.md`, `docs/internal/audits/security/audit-2026-05-18/findings-log.md`

## ADR-SEC-20260518-002 - No Active Exception Open in Precheck Snapshot (Accepted 2026-02-18)

- Context: Soft-gate policy permits accepted risk for selected severities with expiry controls.
- Decision: Carry no accepted-risk exception during this precheck snapshot.
- Options Considered:
  - Open a time-boxed exception preemptively.
  - Keep exception register empty unless a real unresolved finding appears (chosen).
- Consequences:
  - Cleaner governance posture and no hidden risk debt entering audit week.
  - Requires prompt handling if a new high/critical issue appears later.
- Related finding IDs: SEC-20260518-006
- Links: `docs/reference/security/ci-gate-policy.json`, `tmp/security/security-gate-result.json`

## ADR-SEC-20260518-003 - Keep Audit Date Contract as ISO Folder Name (Accepted 2026-02-18)

- Context: Multiple prior folder naming patterns existed in older documents.
- Decision: Continue strict `audit-YYYY-MM-DD` naming and treat folder date as planned execution date.
- Options Considered:
  - Use generation date for folder naming.
  - Keep scheduled audit date as folder name (chosen).
- Consequences:
  - Index chronology remains stable and machine-checkable.
  - Content must include generated timestamp to avoid date confusion.
- Related finding IDs: N/A
- Links: `scripts/security/init-audit-doc-kit.mjs`, `docs/internal/audits/security/index.md`

## Definition of Done

- All material risk, scope, naming, or exception decisions are logged with date and rationale.
