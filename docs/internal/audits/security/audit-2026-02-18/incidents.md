# Security Audit Incidents - 2026-02-18

## Incident 2026-02-18 - Security Soft Gate Blocked by High Finding

- Impact: CI security gate result was failing, temporarily preventing compliant merge/release flow.
- Detection: `scripts/security/evaluate-gate.mjs` output in `tmp/security/security-gate-result.json`.
- Root Cause: Open high-severity finding `SEC-20260218-001` (`AUTO-AUTHZ-ROLE-001`) in profile update contract.
- Mitigation: Completed remediation `REM-20260218-001` by removing role mutation from profile update flow and adding regression test coverage.
- Follow-up actions:
  - Keep role immutability test coverage in auth integration suite.
  - Re-run security delta/gate in every security-impacting PR.
- Related finding IDs: SEC-20260218-001

## Resolution 2026-02-18

- Gate now passes: `tmp/security/security-gate-result.json` -> `passed: true`, `blocking: 0`.
- Related medium finding `SEC-20260218-002` also resolved in-cycle by adding PATCH to CORS methods.
- Dependency advisories `SEC-20260218-003`, `SEC-20260218-004`, and `SEC-20260218-005` were remediated and verified with a clean production audit snapshot.

## Definition of Done

- Every gate or audit disruption includes impact, root cause, mitigation, and follow-up actions.
