# Lakira BE Feature Slice Migration Consistency — Stabilization Plan (v2)

**Document:** `lakira-be-feature-slice-migration-consistency-plan-v2.md`  
**CreatedAt:** 2025-12-14T16:07+07:00  
**LastUpdatedAt:** 2025-12-14T16:07+07:00  
**Status:** Draft (Ready for execution)

---

## Codex Execution Notes

**Goal:** Stabilize feature-slice consistency without changing business logic, API behavior, or database schema unless a checklist ticket explicitly says so.

**Scope (must scan):**

- `src/features/**`
- `src/types/api/**` (if used by feature validators)
- OpenAPI registry setup (`src/lib/openapi/**` or equivalent)
- Shared modules: `src/shared/**` or `src/common/**` (if present)
- Tests: `src/**/__tests__/**`, `tests/**`

**Out of scope (do not change unless explicitly instructed):**

- Database migrations and schema changes
- Endpoint routes and URL paths (unless explicitly stated)
- Domain rules / business logic
- Public response DTO shapes (unless explicitly required and documented)
- Auth semantics (JWT/session handling)

**Non-negotiable consistency rules (apply globally):**

1. No cross-slice HTTP imports (routers/controllers do not import other feature controllers).
2. Single validation flow (router middleware + consistent accessor).
3. Single success envelope (uniform success response format).
4. Unified test override convention (naming + export).
5. Uniform schema ownership strategy (feature-owned OR centralized; pick one).

**Refactor constraints:**

- Prefer “move + re-export” over rewrite.
- Keep changes incremental and minimal.
- Every step must compile; tests must pass.

---

## 1. Objectives

1. Remove slice boundary violations and make feature slices independently maintainable.
2. Standardize request validation and success response contracts across all slices.
3. Standardize schema ownership (and OpenAPI registration approach).
4. Standardize test override hooks to reduce test friction.
5. Decouple visualization cache invalidation via ports/shared utilities (no direct analytics import).

---

## 2. Deterministic Commands (Execution + Evidence)

> Codex must read the repo root `package.json` (and workspace config if present) and confirm the exact commands below.
> If scripts are not present, use the fallback commands.

### 2.1 Primary commands (repo scripts in `package.json`)

- **Lint:** `npm run lint`
- **Unit/integration tests (CI-friendly):** `npm run test:ci` (avoids the watch mode in `test:dev`)
- **Contract tests (when applicable):** `npm run test:contract:local`
- **OpenAPI generation (when applicable):** `npm run docs:openapi:generate`

### 2.2 Fallback commands (because there is no dedicated build/typecheck script)

- **Typecheck / “build”:** `npx tsc --noEmit`
- **Direct Jest invocation (only if the script above fails):** `npx jest --detectOpenHandles`

### 2.3 Evidence requirement

Each checklist ticket must record:

- exact command(s) run from the lists above
- PASS/FAIL (plus relevant output if failing)
- link to PR or commit hash
- grep proof when enforcing boundary rules (e.g., cross-slice imports)

---

## 3. Decisions to Lock (Gold Pattern)

### D1 — Feature boundary rule

- **Rule:** A feature router/controller must not import another feature’s controller.
- **Mechanisms allowed:**
  - Application ports injected via feature builder
  - Shared infra utilities under `src/shared/**` for infra-only concerns

### D2 — Validation rule

- **Rule:** Router validates; controllers read validated payloads in a consistent way.
- **Implementation:** standardize on `validate(schema)` + a single accessor (`pickValidated` or equivalent).

### D3 — Success response envelope

- **Rule:** All successful responses use the standardized helper (recommended: `successResponse`).
- **Exception policy:** only explicit exceptions documented with rationale.

### D4 — Schema ownership strategy (choose one)

- **D4A (recommended):** feature-owned schemas in `src/features/<slice>/infrastructure/http/validators.ts`
- **D4B:** centralized schemas in `src/types/api/**`

> **Plan default:** D4A (feature-owned) to align with vertical-slice architecture.

### D5 — Test override convention

- **Rule:** single naming convention for test overrides across all slices.
- **Recommended:** `override<Feature>ForTest(...)`

---

## 4. Work Phases (with explicit mapping to tickets)

### Phase 0 — Baseline + guardrails (maps to MAJOR-0, optional)

1. Confirm repo scripts in `package.json` and update this plan section if needed.
2. Run lint/test/typecheck/build once to establish baseline evidence.

**Exit criteria:**

- baseline evidence recorded.

---

### Phase 1 — Remove cross-slice HTTP imports (maps to MAJOR-1)

**Steps:**

1. Find all instances where a router/controller imports another feature’s controller.
2. Replace with one of:
   - Move route under the owning slice router (preferred when clearly owned).
   - Create an application port and inject it.

**Exit criteria:**

- No cross-slice controller imports remain.

---

### Phase 1.5 — Decouple Analytics visualization invalidation (maps to MAJOR-2)

**Problem statement:**
MetricLog and MetricSettings should not directly import analytics invalidation helpers (e.g., `invalidateVizByMetric`) because it couples slices at the infra layer.

**Target architecture (recommended):**

- Define a port/interface:
  - `VisualizationInvalidationPort` with methods like:
    - `invalidateByMetric(userId: string, metricId: string): Promise<void>`
- Provide analytics implementation inside Analytics slice:
  - `AnalyticsVisualizationInvalidationService implements VisualizationInvalidationPort`
- Inject the port into dependent slices via feature builders:
  - MetricLogs builder receives `visualizationInvalidator`
  - MetricSettings builder receives `visualizationInvalidator`

**Steps:**

1. Identify direct imports from analytics invalidation helpers in:
   - `src/features/metric-logs/infrastructure/cache/**`
   - `src/features/metric-settings/infrastructure/cache/**`
2. Introduce the port in **one** stable location (choose one):
   - `src/shared/application/ports/VisualizationInvalidationPort.ts` (recommended), OR
   - `src/features/analytics/application/ports/VisualizationInvalidationPort.ts`
3. Implement the port in analytics and export it from analytics feature builder.
4. Update metric-logs and metric-settings to depend on the port (DI), not direct imports.
5. Verify invalidation triggers still fire on:
   - metric-log create/update/delete
   - settings changes that affect visualization

**Exit criteria:**

- No non-analytics slice imports analytics cache invalidation modules.
- Invalidation still occurs (behavior preserved).
- Evidence recorded: grep + tests.

---

### Phase 2 — Standardize validation flow (maps to MAJOR-3)

- Replace controller-level manual parsing with the router+accessor approach.

**Exit criteria:**

- Single validation pattern used everywhere.

---

### Phase 3 — Standardize success response envelope (maps to MAJOR-4)

- Replace raw JSON returns on success with the standardized helper.

**Exit criteria:**

- All success paths use the same envelope.

---

### Phase 4 — Standardize schema ownership + OpenAPI registration (maps to MAJOR-5)

- Apply D4A (feature-owned) consistently.
- Align OpenAPI registration so schema/path generation is predictable.

**Exit criteria:**

- One schema strategy; OpenAPI generation stable.

---

### Phase 5 — Standardize test override hooks (maps to MAJOR-6)

- Replace `__set*Feature` with `override*ForTest` (or chosen standard).

**Exit criteria:**

- All slices use the same override convention.

---

### Phase 6 — Minor cleanup (maps to MINOR-1..MINOR-4)

- Naming defects, cache key normalization, logging policy, doc polish.

---

## 5. Final Verification Checklist (Deterministic)

Run and record:

1. `npm run lint`
2. `npm run test:ci`
3. `npx tsc --noEmit`
4. `npm run docs:openapi:generate` (when schema ownership changes touch OpenAPI)
5. Boundary grep checks:
   - `rg 'from "@/features/analytics/' src/features -g'*.ts' -g'*.tsx'` (ensure only analytics uses analytics)
   - `rg '__set[A-Za-z]+Feature' src/features` (ensure removed)
   - `rg '\.parse\(req\.body\)' src/features` (ensure removed unless explicitly allowed)

---

## 6. Rollback Strategy

- One ticket per commit (preferred).
- Avoid squashing until phase completion.
- Each phase should be revertible.
