# Security Guides Index

Start here if you are new to the Lakira security audit framework.

## Recommended Reading Order

1. Framework basics:

- `docs/how-to/security/security-framework-junior-guide.md`

2. Command playbook:

- `docs/how-to/security/run-a-security-audit.md`

3. Release process:

- `docs/how-to/security/release-delta-sop.md`

4. Branch-based execution workflow:

- `docs/how-to/security/audit-branch-model.md`

5. Deep references:

- `docs/reference/security/security-audit-framework.md`
- `docs/reference/security/security-audit-master-checklist.md`
- `docs/reference/security/risk-scoring-model.md`

## Quick Start

```bash
npm run security:audit:init -- --date YYYY-MM-DD
npm run security:delta:gate
```

Then update the current audit run docs under `docs/internal/audits/security/audit-YYYY-MM-DD/`.
