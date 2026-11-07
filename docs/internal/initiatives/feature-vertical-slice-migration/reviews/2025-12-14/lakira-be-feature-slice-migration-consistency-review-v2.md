# Lakira BE Feature Slice Migration Consistency — In-Depth Review (v2)

**Document:** `lakira-be-feature-slice-migration-consistency-review-v2.md`  
**CreatedAt:** 2025-12-14T16:07+07:00  
**LastUpdatedAt:** 2025-12-14T16:07+07:00  
**Audience:** Maintainers, future reviewers (portfolio), and automation agents (Codex)

---

## 0. Codex Notes (Read Me)

This document is informational and sets expectations for execution. Implementation should follow:

- `lakira-be-feature-slice-migration-consistency-plan-v2.md`
- `lakira-be-feature-slice-migration-consistency-checklist-v2.md`

Avoid “nice-to-have” refactors not listed as checklist items.

---

## 1. Purpose

Capture cross-slice consistency findings after feature-vertical-slice migration and provide evidence pointers (files + search anchors) so changes can be executed deterministically.

---

## 2. Scope

**In scope:**

- `src/features/**` with slices: `auth`, `metric`, `metric-categories`, `metric-logs`, `metric-settings`, `analytics`
- Validation + response conventions (Zod/middleware, response helpers)
- OpenAPI schema ownership + registration
- Cache invalidation integration and cache key conventions
- Test override hooks and feature builders

**Out of scope (unless promoted into the plan/checklist):**

- Domain/business logic changes
- DB schema changes / migrations
- API path changes
- Auth semantic changes (JWT/session behavior)

---

## 3. Severity Scale

| Severity   | Meaning                                                                                   | Typical Impact                                          |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **High**   | Boundary/contract risk; likely to cause coupling regressions or inconsistent API behavior | Portfolio reviewers notice; future maintenance friction |
| **Medium** | Causes drift or inconsistent dev experience but low immediate risk                        | Confusion, inconsistent patterns                        |
| **Low**    | Cosmetic/ergonomic; cleanup quality                                                       | Small polish improvements                               |

---

## 4. What is already strong (Keep)

### 4.1 Feature assembly is generally present (Medium confidence)

Most slices expose a feature builder pattern (e.g., `build<Feature>Feature()`) and a slice `index.ts` that exports a router and builder. This is a good foundation for dependency injection and testing.

**Evidence pointers (search anchors):**

- Search for: `buildAuthFeature`, `buildMetricLogFeature`, `buildAnalyticsFeature`
- Likely files:
  - `src/features/auth/index.ts`
  - `src/features/metric-logs/index.ts`
  - `src/features/analytics/index.ts`

### 4.2 Controllers are mostly thin and consistent (Medium confidence)

Many controllers:

- assert authentication (e.g., `assertAuthenticated(req)`)
- use a common success response helper
- rely on router-level validation middleware

**Evidence pointers (search anchors):**

- Search for: `assertAuthenticated(`, `successResponse(`
- Likely files:
  - `src/features/auth/infrastructure/http/*.controller.ts`
  - `src/features/analytics/infrastructure/http/*.controller.ts`

### 4.3 Caching exists and is versioned in places (Medium confidence)

Key versioning patterns like `:v1:` exist, suggesting forward-compatible cache evolution.

**Evidence pointers:**

- Search for: `:v1:` and `cursor`
- Likely files:
  - `src/features/**/infrastructure/cache/**`

---

## 5. Major Findings (with evidence pointers)

> These are “portfolio-impacting” and should be stabilized first.

### MAJOR-1 (High): Feature boundary violations via cross-slice HTTP imports

**Symptom:**
A feature slice router/controller imports another slice’s HTTP controller and exposes it under its own routes.

**Why this matters:**

- Tight coupling at the HTTP layer undermines vertical-slice ownership.
- Creates risk of circular dependencies and brittle refactors.

**Industry-standard direction:**

- No cross-slice controller imports.
- Cross-feature integration should occur via:
  - an application port injected into the dependent slice, or
  - a shared infra utility in `src/shared/**` (only for infra concerns).

**Evidence pointers (search anchors):**

- Search for imports of analytics controllers inside other slices:
  - `from "@/features/analytics/"`
  - `handleMetricTrend`
- Likely files:
  - `src/features/metric/infrastructure/http/metric.router.ts` (or similar)
  - `src/features/analytics/infrastructure/http/*controller*.ts`

---

### MAJOR-2 (High): Cross-slice cache invalidation imports

**Symptom:**
Caches in `metric-logs` and/or `metric-settings` import an Analytics invalidation helper directly.

**Why this matters:**

- Cross-slice infra imports become “hidden dependencies.”
- Any change in Analytics caching breaks other slices.

**Industry-standard direction:**

- Replace direct imports with a stable interface:
  - **Preferred:** `VisualizationInvalidationPort` injected into metric-\* features via feature builders.
  - **Alternative:** shared infra util in `src/shared/cache/**` with stable API.

**Evidence pointers (search anchors):**

- Search for: `invalidateVizByMetric`, `invalidateViz`, `visualization cache invalidation`
- Likely files:
  - `src/features/metric-logs/infrastructure/cache/**`
  - `src/features/metric-settings/infrastructure/cache/**`
  - `src/features/analytics/infrastructure/cache/**` (source invalidation helper)

---

### MAJOR-3 (High): Validation flow inconsistent (middleware vs manual parse)

**Symptom:**
Some controllers parse request bodies inside handlers (`schema.parse(req.body)`), while others rely on router middleware + a validated accessor.

**Why this matters:**

- Inconsistent behavior and error handling over time.
- Double-parse risk, mismatched defaults, and harder review.

**Industry-standard direction:**
Adopt one validation contract across all slices:

- Router uses `validate(schema)` (or equivalent)
- Controller reads validated values via a single consistent mechanism (e.g., `pickValidated(schema)(req)`)

**Evidence pointers (search anchors):**

- Search for: `.parse(req.body)` and compare to `validate(` usage
- Likely files:
  - `src/features/**/infrastructure/http/*.controller.ts`
  - `src/features/**/infrastructure/http/*.router.ts`

---

### MAJOR-4 (High): Success response envelope inconsistent

**Symptom:**
Some success endpoints use `successResponse(...)`, others return raw JSON.

**Why this matters:**

- API contract drift, inconsistent client expectations, OpenAPI mismatch.
- Very visible in a portfolio code review.

**Industry-standard direction:**

- Standardize success responses using the chosen helper (recommended: `successResponse`).
- Allow exceptions only when explicitly documented.

**Evidence pointers (search anchors):**

- Search for: `return res.json(` in controllers; compare to `successResponse(`
- Likely files:
  - `src/features/auth/infrastructure/http/*.controller.ts` (e.g., logout)
  - `src/features/analytics/infrastructure/http/*.controller.ts` (e.g., metric trend)

---

### MAJOR-5 (Medium-High): Mixed schema ownership + OpenAPI registration patterns

**Symptom:**
Some slices define schemas locally, others import from `src/types/api/**`, and OpenAPI registration is inconsistent.

**Why this matters:**

- Diffuse ownership creates drift.
- Harder for Codex (and humans) to know where to edit.

**Industry-standard direction:**
Pick one and enforce:

- **Preferred for vertical slices:** feature-owned schemas under `src/features/<slice>/infrastructure/http/validators.ts`
- **Alternative:** centralized schemas under `src/types/api/**`

**Evidence pointers (search anchors):**

- Search for: `src/types/api/` imports and local `extendZodWithOpenApi`
- Likely files:
  - `src/features/auth/infrastructure/http/auth.schemas.ts` (or similar)
  - `src/types/api/**`
  - `src/lib/openapi/**` (registry)

---

### MAJOR-6 (Medium-High): Test override API inconsistent

**Symptom:**
Mix of override methods (e.g., `override<Feature>Feature` vs `__set<Feature>Feature`).

**Why this matters:**

- Higher cognitive load for tests and automation.
- Looks inconsistent to reviewers.

**Industry-standard direction:**
Unify naming and behavior. Recommended:

- `override<Feature>ForTest(customDeps: Partial<Deps>)`

**Evidence pointers (search anchors):**

- Search for: `__set`, `override`, `ForTest`
- Likely files:
  - `src/features/**/index.ts`
  - test bootstrap files

---

## 6. Minor Findings (polish / stabilization tail)

### MINOR-1 (Low-Medium): Naming/copy-paste defects in exports/types

**Evidence pointers:**

- Search for mismatched result names (e.g., category names inside metric slice result types)
- Likely in: `src/features/metric/**/repos/*.ts`

### MINOR-2 (Low-Medium): Cache key style differs across slices

**Evidence pointers:**

- Search: `sha1`, `base64url`, `:v1:`, `cursor`
- Likely in: `src/features/**/infrastructure/cache/**`

### MINOR-3 (Low): Cache invalidation logging inconsistent

**Evidence pointers:**

- Search for cache invalidation logs (e.g., “invalidate” + logger usage)
- Likely in: `src/features/**/infrastructure/cache/**`

---

## 7. Locked Recommendations (Gold Standard)

These are the “gold” consistency rules that the plan/checklist enforce:

1. No cross-slice HTTP imports (routers/controllers do not import other slices’ controllers).
2. One validation flow across all routes.
3. One success response envelope for all success endpoints.
4. One schema ownership strategy across the whole repo.
5. One test override convention across the whole repo.

---

## 8. Next Steps

Proceed to:

- `lakira-be-feature-slice-migration-consistency-plan-v2.md` — stabilization sequencing and deterministic commands
- `lakira-be-feature-slice-migration-consistency-checklist-v2.md` — execution tickets with evidence tracking
