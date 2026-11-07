# Decisions — Feature Audience Restructure

ADR-style log. Statuses: `Proposed`, `Accepted`, `Superseded`, `Rejected`.

---

## ADR-001 — Three-bucket audience taxonomy: `public/`, `admin/`, `shared/`

Promoted to the architecture decision registry as **[ADR-0013](../../../explanation/decisions/adr-0013-three-bucket-audience-taxonomy.md)**. That file is authoritative; this entry is a pointer.

## ADR-002 — Preserve `@/features/<feature>/*` import paths via tsconfig aliases

Promoted to the architecture decision registry as **[ADR-0014](../../../explanation/decisions/adr-0014-preserve-feature-import-paths-via-aliases.md)**. That file is authoritative; this entry is a pointer.

## ADR-003 — Defer rewrite of cross-feature imports to audience-prefixed paths

Promoted to the architecture decision registry as **[ADR-0015](../../../explanation/decisions/adr-0015-defer-cross-feature-import-rewrite.md)**. That file is authoritative; this entry is a pointer.

## ADR-004 — Defer ESLint rule for cross-audience import enforcement (Proposed YYYY-MM-DD)

**Context:** Once `public/`, `admin/`, `shared/` exist, we could enforce at lint-time that `public/*` cannot import `admin/*`, `admin/*` cannot import `public/*`, and both can import `shared/*`. This would harden the boundary mechanically.

**Decision:** Skip in this PR. Add the rule once at least one real `admin/` slice exists and we have data on legitimate boundary patterns.

**Options considered:**

1. **Add the rule now** — risks blocking the move with false positives from auto-generated paths or test-only imports; no admin code exists to validate the rule.
2. **Defer (chosen)** — boundaries today are documented in this kit and reviewer-enforced. Mechanical enforcement comes when we have something real to protect.

**Consequences:**

- No mechanical guardrail until a follow-up. Reviewers must catch boundary violations during code review.
- Track in Post-Merge Follow-ups.

**Links:** [Plan §Open Questions](./feature-audience-restructure-plan.md#open-questions)

---

## ADR-005 — `requireAdmin` lives under `shared/auth/infrastructure/http/`

Promoted to the architecture decision registry as **[ADR-0016](../../../explanation/decisions/adr-0016-require-admin-lives-under-shared-auth.md)**. That file is authoritative; this entry is a pointer.
