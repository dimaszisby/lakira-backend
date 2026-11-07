# Security Audit Decisions - 2026-02-18

## ADR-SEC-001 - Adopt Reusable Audit Framework v1 (Accepted 2026-02-18)

- Context: Prior audits existed as one-off artifacts and were difficult to execute consistently.
- Decision: Standardize on framework + template + script model under `docs/security/`.
- Options Considered:
  - Continue ad-hoc per-audit docs.
  - Build reusable framework and automation (chosen).
- Consequences:
  - Faster repeatable audits with stronger traceability.
  - Additional maintenance burden for templates/policy/scripts.
- Related finding IDs: N/A (program-level decision)
- Links: `docs/reference/security/`, `scripts/security/`, `docs/reference/security/audit-run-template/`

## ADR-SEC-002 - Enforce Soft CI Gate for High/Critical Findings (Accepted 2026-02-18)

- Context: Need practical enforcement that blocks serious risk without freezing delivery on medium/low backlog items.
- Decision: Use soft gate that fails CI only on unresolved high/critical findings, with accepted-risk expiry handling.
- Options Considered:
  - Hard gate for all severities.
  - Advisory-only checks.
  - Soft gate (chosen).
- Consequences:
  - High-risk findings cannot be ignored.
  - Medium/low findings still require ownership and target dates.
- Related finding IDs: SEC-20260218-001
- Links: `docs/reference/security/ci-gate-policy.json`, `scripts/security/evaluate-gate.mjs`, `.github/workflows/backend-ci.yml`

## ADR-SEC-003 - No Exception Granted for High Finding; Immediate Remediation Completed (Accepted 2026-02-18)

- Context: `SEC-20260218-001` was a high-severity authz contract weakness and temporarily blocked the gate.
- Decision: Do not apply temporary exception; remediate directly in next patch cycle.
- Options Considered:
  - Grant temporary accepted risk exception.
  - Remediate immediately (chosen).
- Consequences:
- Security gate returned to passing status after remediation landed.
- Reduces risk of latent privilege escalation regression.
- Related finding IDs: SEC-20260218-001
- Links: `docs/internal/audits/security/audit-2026-02-18/remediation-plan.md`, `tmp/security/security-gate-result.json`
