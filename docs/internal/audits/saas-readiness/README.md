# SaaS Base Readiness

## Overview

This kit holds the SaaS-base readiness audit for the Lakira backend — a graded, file-path-precise assessment of how close the repo is to being **forkable as a generic SaaS base** rather than a personal-app codebase.

The audit grades against the project's own intended standard (`.claude/rules/*`, `docs/explanation/testing-strategy.md`, `docs/reference/ci-pipeline/strategy.md`) and not just generic SaaS criteria. Empirical verification commands are run; a category cannot be Pass if its verification fails or if the intended standard itself is missing.

## Scope

- **In scope:** structural readiness (auth, security, observability, multi-tenancy, DX, CI/CD, forkability) + architectural drift detection across feature slices.
- **Out of scope:** UX of any consumer surface, the frontend codebase, performance/load testing, deep dependency CVE triage (the `security:delta:check` gate already covers that).

## Files in this kit

- `README.md` — this file.
- `FINAL-AUDIT-SUMMARY.md` — **the live status.** Verdict, open caveats and findings, and the lineage of audit runs. Start here.
- `audit-2026-05-01.md` — baseline audit run. Contains the scorecard, gap entries (P0/P1/P2), evidence, and recommended fixes.
- `audit-2026-05-20.md`, `audit-2026-05-24-independent.md`, `audit-2026-06-05.md` — later dated runs; each is a record of its date.
- `iteration-plan.md` — master roadmap mapping each remediation phase to its own architecture-folder kit. Read this to know which kit to open when picking up a phase.
- `decisions.md` — ADR entries for any standards adopted in response to the audit. New decisions append here; do not rewrite history.

The repo-root `SAAS-BASE-CHECKLIST.md` is the public, consumer-facing one-pager: verdict + scorecard + top 5 gaps. It links here for detail.

## Iteration plan

Doc kits for each P0/P1 remediation phase live as siblings under `docs/internal/initiatives/<topic>/`. The full per-phase mapping (which kit closes which audit gaps, gating ADRs, recommended execution order) is in [`iteration-plan.md`](./iteration-plan.md). The `saas-readiness/` folder stays as the **tracker**; the actual remediation work lives in the per-topic kits.

## Re-running the audit

Run all six commands and capture exit codes:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run security:delta:check
npm run docs:openapi:generate
```

A category cannot be Pass if any of those fail. See `audit-2026-05-01.md` Appendix B for the full re-audit recipe (branding scan, env-bypass scan, sequelize-leak scan, soft-delete consistency scan).

When re-auditing, write the result to a new dated file (`audit-YYYY-MM-DD.md`) in this folder — do not overwrite the prior one. Diff the scorecards across runs to track progress.

## How to read the gap entries

Each non-item in `audit-2026-05-01.md` follows the same structure:

- **Status** — Partial or Missing.
- **What's missing/incomplete** — 1–3 sentences, no soft pedalling.
- **Why it matters for a SaaS base** — the reason it's worth fixing for a forker.
- **Recommended fix** — opinionated, picks specific lib/pattern fitting the existing stack.
- **Effort** — S (≤ ½ day) / M (1–3 days) / L (>3 days).
- **Evidence** — exact file paths or "no file found".

## Severity tags

- **P0** — blocks "fork-ready" status. Security holes, missing license, no `.env.example`, no README.
- **P1** — should be fixed before recommending the base externally. Missing email verification, no Sentry hook, soft-delete drift, etc.
- **P2** — nice-to-have. OAuth, feature flags, outbound webhooks, APM, etc.

## Fork-ready exit criteria

The repo is fork-ready only when **all four** conditions hold:

1. Zero P0 gaps remaining.
2. All six empirical commands green.
3. Categories 1 (Auth), 4 (Security), 6 (DX), 7 (Testing), 8 (CI/CD), 11 (Forkability) at ≥80% Yes.
4. `LICENSE` and `.env.example` present.

At the 2026-05-01 baseline: condition 1 failed (7 P0s), condition 3 failed (5 of 6 categories below 80%), condition 4 failed (both files missing). Condition 2 held. All four have held since the 2026-05-24 independent audit; current status is in `FINAL-AUDIT-SUMMARY.md`.

## References

- `docs/internal/todos/2026-05-01-promt-saas-readiness-audit.md` — the audit prompt.
- `.claude/rules/` — the intended standard.
- `docs/explanation/testing-strategy.md`
- `docs/reference/ci-pipeline/strategy.md`
- `docs/internal/audits/security/` — security-audit runs (do not reformat; schema-validated by `security-framework.validation.test.ts`).
- `docs/reference/api/lakira-backend-openapi.json` — generated API contract.
