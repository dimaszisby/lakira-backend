---
name: CI failures on pr/dev-weeks-work (2026-04-21)
description: Two confirmed CI failures: format:check on modified markdown files, and security-framework unit tests due to audit doc schema drift from the recent doc-heavy commit
type: project
---

Two CI failures confirmed on branch `pr/dev-weeks-work` as of 2026-04-21.

**Failure 1 — `checks` job / "Format check" step**
`npm run format:check` exits 1 because 20 markdown/yaml files added or modified in the recent docs-heavy commit are not Prettier-formatted. Fix: `npm run format:write` then commit.

**Failure 2 — `tests` job / "Run unit tests" step (also blocks `security_delta` job)**
`npm run test:unit:security-framework` (run inside the `security_delta` job) and `npm run test:unit` (run in the `tests` job) both fail on `security-framework.validation.test.ts` with 4 test failures:

1. `schema conformance` — `audit-2026-02-18/findings-log.md` uses compact columns (Finding ID, Severity, Theme, Status, Notes) instead of the full required schema (finding_id, title, domain, cvss, likelihood, impact, owasp_asvs_ref, etc.)
2. `traceability` — same compact findings-log has no rows matching `SEC-*` in `finding_id` column (column name mismatch means parser returns 0 rows)
3. `recurrence continuity` — `docs/internal/audits/security/index.md` uses `Run Date` as the column header, but test reads `row["Audit Date"]`, returning undefined; the expected folder name becomes `"audit-"` instead of `"audit-2025-11-21"`
4. `portfolio sanitization` — `audit-2026-02-18/portfolio-summary.md` is missing required sections `## Findings Overview` and `## Remediation Posture` and the text "gate status is now passing"

**Why:** The recent docs-heavy commit (`a0ded75` and related) updated/reformatted audit documents and the audit index, but the documents drifted from the schema the security framework validation tests enforce.

**How to apply:** When investigating CI failures involving security or docs changes, check `__tests__/unit/security/security-framework.validation.test.ts` for schema conformance requirements and cross-reference against the actual audit markdown files.
