---
name: project-prior-audits
description: Three SaaS readiness audits completed before 2026-06-05; used to avoid duplicate findings in future scans
metadata:
  type: project
---

Three audits exist under `docs/internal/audits/saas-readiness/`:

- `audit-2026-05-01.md` — initial audit, NOT fork-ready verdict; 7 P0s including no refresh-token, no LICENSE, no trust proxy.
- `audit-2026-05-20.md` — self-audit after major work; most P0s closed.
- `audit-2026-05-24-independent.md` — independent re-audit (Opus 4.7); verdict GOLD WITH CAVEATS. Six caveats: C1 fork bootstrap no-ops, C2 branding leak, C3 error envelope inconsistency, C4 architecture test weak, C5 Sentry no PII scrubbing, C6 log redaction suffix-anchored misses `authorization`.

**Why:** Each audit builds on the prior; never re-raise issues already documented.

**How to apply:** Before reporting a finding, check if it appears in C1–C6 or the gap entries D1–D10 in audit-2026-05-24-independent.md.
