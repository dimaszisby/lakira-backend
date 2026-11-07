---
name: security-audit
description: Run the full security audit pipeline (framework tests, dependency delta, gate evaluation). Use when the user says "security audit", "security check", "pre-release security", or before a production release.
disable-model-invocation: true
---

# Security Audit Pipeline

Run the security checks defined in `docs/how-to/security/release-delta-sop.md`.

## Steps

1. **Run security framework tests**:

   ```bash
   npm run test:unit:security-framework
   ```

   Report pass/fail.

2. **Run the security delta gate** (combined delta check + gate evaluation):

   ```bash
   npm run security:delta:gate
   ```

   This generates artifacts in `tmp/security/`:
   - `security-delta-report.json`
   - `security-gate-result.json`
   - `npm-audit-production.json`

3. **Parse gate results**:

   ```bash
   cat tmp/security/security-gate-result.json
   ```

   - **Pass**: `blocking=0` — no unresolved High/Critical findings
   - **Block**: any unresolved High/Critical findings

4. **Report findings**:

   ```
   Security Audit Results:
     PASS/FAIL Framework tests
     PASS/FAIL Security delta gate

   Gate decision: PASS / BLOCKED
   Blocking findings: [count]
   Non-blocking findings: [count]

   Details: [list any High/Critical findings with descriptions]
   ```

5. **If blocked**, advise:
   - Remediate findings and re-run
   - If temporary exception needed: follow `docs/reference/security/security-exceptions-policy.md`

6. **For production releases**, remind the user to update audit docs in `docs/internal/audits/security/`:
   - `audit-checklist.md`
   - `findings-log.md`
   - `remediation-plan.md`
   - `metrics-tracker.md`
   - `portfolio-summary.md`

   If no active audit run exists:

   ```bash
   npm run security:audit:init -- --date YYYY-MM-DD
   ```
