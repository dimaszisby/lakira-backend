# Feature Vertical Slice Migration Docs

The files in this directory capture every decision, test log, and review tied to the backend feature-slice rollout. Use this README as a map so new contributors can find the canonical sources quickly.

## Quick Start

1. Read `plans/feature-vertical-slice-migration-plan.md` for the executive summary, objectives, and phased roadmap.
2. Track day-to-day execution in `checklists/feature-vertical-slice-migration-checklist.md` and `tracking/phase4-progress.md`.
3. When validating work, reference the dated review folders under `reviews/` for audit evidence and remediation plans.

## Folder Overview

- `plans/` – master plan plus focused playbooks (`phase3-plan.md`, `phase4-plan.md`, `phase4-router-refactor.md`, `metric-category-migration-plan.md`).
- `checklists/` – operational checklist that mirrors the plan and records completion dates/notes.
- `logs/testing/` – verification artifacts for every phase (`phase1-test-log.md` … `phase4-test-log.md`, feature-specific logs, and the general `test-log.md`).
- `tracking/` – running changelog, ticket triage, and progress journal to keep stakeholders aligned.
- `references/` – guardrails and shared conventions such as `feature-boundary-rules.md`, `orm-bootstrap.md`, and `shared-middleware.md`.
- `reviews/` – dated evidence packs (`2025-12-07`, `2025-12-14`, `2025-12-16`) containing in-depth reviews, stabilization plans, and gold reviews.

Keep new documents inside the closest matching folder so the tree stays predictable. If a note spans multiple categories, add a short pointer in this README explaining where it lives and why.
