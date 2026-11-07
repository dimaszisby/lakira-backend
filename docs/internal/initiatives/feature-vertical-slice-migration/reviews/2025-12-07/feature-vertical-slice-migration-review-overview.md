# Feature Vertical Slice Migration – Review Overview

> **Purpose:** Align every feature under `src/features/**` with the canonical vertical-slice / DDD pattern and give Codex a predictable workflow for auditing, planning, and validating changes.

## 1. Mission & Audience

- **Audience:** Codex reviewers, maintainers, and engineers delivering the migration workstream.
- **Mission:** Provide a single source of truth that explains the target architecture, enumerates review artifacts, and defines how Codex should execute each phase.
- **Core Principles:** explicit boundaries, per-feature autonomy, consistent application + domain + infrastructure layering, and cache/persistence abstractions behind ports.

## 2. Scope of the Review

### In Scope

- All existing features under `src/features/**`: `analytics`, `auth`, `metric`, `metric-category`, `metric-log`, `metric-settings`, and `shared`.
- Supporting shared utilities referenced by those features when they contribute to drift from the vertical-slice standard.
- Tooling/docs referenced in the checklist and migration plan.

### Out of Scope

- Non-feature directories (e.g., `src/config`, global middleware) unless explicitly tied to a finding.
- Infra migrations unrelated to feature patterns (Kubernetes, CI, etc.).

## 3. Success Criteria

- Every feature documents strengths, gaps, and remediation steps with traceable IDs.
- Stabilization tasks map 1:1 (or N:1) with findings and include acceptance criteria.
- Gold review reports the disposition of _every_ finding plus newly surfaced issues.
- The resulting folder structure mirrors the canonical layout defined below.

## 4. Target Architecture Snapshot

1. **Vertical Slice Ownership:** Each feature exports its API (`feature.ts`, `index.ts`) and encapsulates application, domain, and infrastructure code.
2. **Domain First:** Entities + value objects live in `domain/**`; repositories and services are defined as interfaces and implemented inside infrastructure.
3. **Ports & Adapters:** Application layer depends only on ports; infrastructure implements adapters (persistence, http, cache).
4. **Use Cases vs. Queries:** Mutating use-cases and read-only queries reside in the application layer with clear naming.
5. **Cache & Transaction Strategy:** Caches expose a feature-specific `CachePort`; persistence mutations run through `TransactionPort` where applicable.

## 5. Canonical Feature Layout

```
feature/
├── application
│   ├── ports
│   ├── queries
│   └── use-cases
├── domain
│   ├── entities
│   ├── repositories
│   ├── services
│   ├── types
│   └── value-objects
├── infrastructure
│   ├── cache
│   ├── http
│   ├── mappers
│   └── persistence
├── tests
├── feature.ts
└── index.ts
```

Use this as the reference when flagging structural deviations (missing folders, misplaced adapters, etc.).

## 6. Required Deliverables

| Artifact                                                             | Description                            | Owner                    | Output Path                                                                       |
| -------------------------------------------------------------------- | -------------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `feature-vertical-slice-migration-in-depth-review.md`                | Finding-level audit of every feature   | Codex reviewer           | `docs/internal/initiatives/feature-vertical-slice-migration/reviews/2025-12-07/…` |
| `feature-vertical-slice-migration-stabilize-feature-pattern-plan.md` | Execution plan grouped by feature/task | Codex planner            | same directory                                                                    |
| `feature-vertical-slice-migration-gold-review.md`                    | Post-implementation verification       | Codex reviewer (round 2) | same directory                                                                    |

All artifacts must reference this overview for terminology and structure.

## 7. Operational Rhythm & Tooling

- **Source of Truth:** The repository in its current state; avoid external gists or ad-hoc docs.
- **Evidence:** Link to files (with line refs) whenever citing findings or proof of remediation.
- **Tracking:** Treat finding IDs as immutable; never recycle IDs between rounds.
- **Cadence:** Complete Steps 1 → 3 sequentially; do not start stabilization planning until the in-depth review document is finalized.

## 8. Workflow for Reviews and Refactors

This section defines how this document should be used together with Codex.

### Step 1 – In-Depth Review (`feature-vertical-slice-migration-in-depth-review.md`)

Goal: produce a detailed audit of the current feature patterns.

- **Input:**
  - This document (`feature-vertical-slice-migration-review-overview.md`)
  - Current `src/features/**` source code.
- **Output:**
  - `docs/internal/initiatives/feature-vertical-slice-migration/reviews/2025-12-07/feature-vertical-slice-migration-in-depth-review.md`
- **Required structure:**
  - Per-feature sections (`analytics`, `auth`, `metric`, `metric-category`, `metric-log`, `metric-settings`, `shared`).
  - For each feature:
    - Summary
    - Strengths
    - Findings list
      - Each finding has a unique ID (e.g. `M-01`, `MC-02`, `AUTH-01`)
      - Description, impact, suggested direction.
      - Evidence links (file + line, screenshot refs, etc.).

Codex should treat this as a **snapshot of the current state**.

### Step 2 – Stabilization Plan (`feature-vertical-slice-migration-stabilize-feature-pattern-plan.md`)

Goal: derive a concrete refactor plan to align all features with the target pattern.

- **Input:**
  - `feature-vertical-slice-migration-in-depth-review.md`
  - This overview document as the architecture standard.
- **Output:**
  - `docs/internal/initiatives/feature-vertical-slice-migration/reviews/2025-12-07/feature-vertical-slice-migration-stabilize-feature-pattern-plan.md`
- **Required structure:**
  - Grouped by feature plus optional cross-cutting section.
  - Each task references one or more finding IDs from the in-depth review.
  - Each task includes:
    - Description
    - Affected files/modules
    - Steps (high-level)
    - Acceptance criteria (what “done” means).
    - Owner (optional but encouraged) and target milestone/date if known.

Codex should treat this as the **implementation roadmap**.

### Step 3 – Gold Review (Post-Implementation)

Goal: verify that the refactors were completed and the feature patterns are stable (“gone gold”).

- **Input:**
  - Updated source code after executing the plan.
  - `feature-pattern-standard` (this document plus the agreed canonical structure).
  - `feature-vertical-slice-migration-stabilize-feature-pattern-plan.md` and `feature-vertical-slice-migration-in-depth-review.md`.
- **Output:**
  - Either:
    - `docs/internal/initiatives/feature-vertical-slice-migration/reviews/2025-12-07/feature-vertical-slice-migration-gold-review.md`, or
    - An updated in-depth review marked as **Round 2** if the work regressed.
- **Required structure:**
  - For every finding ID from the original review, mark status:
    - `Resolved`, `Partially Resolved`, or `Not Addressed`.
    - Include verification notes (what evidence proves the status).
  - Note any new findings that appeared due to refactors.

Codex should treat this as a **post-implementation audit** confirming that the feature patterns now match the standardized architecture.
