# Feature Vertical Slice Migration – Stabilize Feature Pattern Plan

> **Source:** `feature-vertical-slice-migration-in-depth-review.md`.  
> **Goal:** Bring every feature back to the canonical vertical-slice / DDD pattern defined in `feature-vertical-slice-migration-review-overview.md`.

## How to Read This Plan

- Each task references one or more review finding IDs (e.g., `AN-01`, `G-02`).
- Use checkboxes to track completion; keep IDs immutable even across iterations.
- Include owners/dates as metadata when known (e.g., `Owner: @user`, `Target: 2024-07-15`).
- Acceptance criteria must be testable and reference files or behaviors.

### Status Legend

| Symbol | Meaning     |
| ------ | ----------- |
| `[ ]`  | Not started |
| `[~]`  | In progress |
| `[x]`  | Complete    |

## Global / Cross-Cutting Objectives

- Unify shared abstractions (CachePort, TransactionPort) where duplication exists.
- Ensure every feature exports a `feature.ts` describing its container wiring.
- Remove legacy service locators or circular dependencies between features.

### Tasks

- [x] **G-01 – Standardize read/query port pattern**
  - From findings: G-01, AN-01, M-01, M-02, ML-01
  - Description: Introduce feature-local read/query ports so application-layer queries never import `sequelize` or raw SQL directly.
  - Affected Areas: `src/features/analytics/application/queries`, `src/features/metric/application/queries`, `src/features/metric-log/application/queries`, associated `infrastructure/persistence` adapters, `infrastructure/db`.
  - Steps:
    1. Define interface(s) per feature (e.g., `VisualizationReadRepository`, `MetricReadRepository`, `MetricLogReadRepository`).
    2. Move SQL/Sequelize logic into adapters under `infrastructure/persistence` (or `infrastructure/sql`), returning domain/DTO objects expected by the application layer.
    3. Update application queries to depend on the new interfaces and inject them via feature builders.
    4. Add unit tests that stub the new ports and integration tests that cover the adapters.
  - Acceptance Criteria:
    - No file in `application/**` imports `sequelize`, `models`, or SQL builders directly.
    - Feature builders instantiate and provide the new read ports.
    - Tests demonstrate queries executing against stubbed ports. `__tests__/features/*/application/*.test.ts`

- [x] **G-02 – Localize DTOs and validation under each feature**
  - From findings: AUTH-01, AUTH-02, ML-02, MS-01, MS-02
  - Description: Relocate request/response DTOs, Zod schemas, and transport mappers into their owning feature slices to avoid coupling to global `types`/`utils`.
  - Affected Areas: `src/features/auth/infrastructure/http`, `src/features/metric-log/infrastructure/http`, `src/features/metric-settings/infrastructure/http`, shared DTO directories.
  - Steps:
    1. Create feature-scoped `dto.ts`/`schema.zod.ts`/`mappers.ts` files mirroring the canonical layout.
    2. Update routers/controllers to import from the new files and remove reliance on `@/types` and `@/utils` DTO exports.
    3. Provide re-export stubs if external callers still need existing DTO types (document deprecation path).
    4. Run lint/tests to ensure no unresolved imports remain.
  - Acceptance Criteria:
    - Each affected feature has local DTO + validation modules referenced exclusively by its HTTP layer.
    - Shared `@/types/dtos` and `@/types/api` no longer contain feature-specific Zod/DTO definitions.
    - Documentation updated to reflect new ownership.

---

## Feature: analytics

### Goals

- Application queries depend only on domain/read ports; no direct Sequelize imports.
- Dashboard caching flows are abstracted behind a CachePort with DI through `feature.ts`.
- HTTP presentation layer pulls dependencies from a feature builder and follows canonical `infrastructure/http` naming.

### Tasks

- [x] **AN-01 – Introduce VisualizationReadRepository** (addresses finding AN-01 & G-01)
  - Description: Move dashboard visualization SQL/Sequelize access into a repository adapter while the application query consumes a port.
  - Affected Files: `src/features/analytics/application/queries/GetDashboardVisualization.ts`, new `application/ports/VisualizationReadRepository.ts`, `infrastructure/sql/*`, `infrastructure/persistence/*`.
  - Steps:
    1. Define a read port that exposes the data needed for dashboard visualizations.
    2. Implement the port using current SQL/Sequelize logic under `infrastructure`.
    3. Update `getDashboardVisualization` to accept the port via constructor and remove direct ORM imports.
    4. Update controllers/tests to instantiate the query through the feature builder.
  - Acceptance Criteria:
    - `getDashboardVisualization` only imports domain types + the new port.
    - Feature builder composes the port adapter.
    - Tests cover both adapter (integration) and query (unit via stub).

- [x] **AN-02 – Wrap cache access behind CachePort** (addresses finding AN-02)
  - Description: Create a feature-specific `CachePort` and Redis adapter so queries never import `vizCache` helpers directly.
  - Affected Files: `src/features/analytics/application/queries/GetDashboardVisualization.ts`, new `application/ports/CachePort.ts`, `infrastructure/cache/vizCache.ts`.
  - Steps:
    1. Define the CachePort interface covering get/set/invalidate needs.
    2. Implement the port by adapting existing `vizCache` logic.
    3. Inject the cache port into queries/controllers via feature builder.
    4. Document cache invalidation strategy alongside port definition.
  - Acceptance Criteria:
    - Cache access in the application layer goes exclusively through the port.
    - Invalidation rules live close to the adapter with tests verifying key generation.

- [x] **AN-03 – Add feature builder and canonical HTTP layer** (addresses finding AN-03)
  - Description: Create `feature.ts` + `index.ts` that wire queries/ports and move controllers/routers under `infrastructure/http` naming conventions.
  - Affected Files: `src/features/analytics/infrastructure/http/**/*`, new `feature.ts`, `index.ts`, potential router exports.
  - Steps:
    1. Introduce `feature.ts` that instantiates repositories, cache, and query handlers.
    2. Move/rename `infrastructure/http` to `infrastructure/http` (or re-export) following the standard folder layout.
    3. Update controllers to resolve dependencies from the feature builder (with override hooks for testing).
    4. Update documentation + imports across the codebase.
  - Acceptance Criteria:
    - Analytics feature exposes `buildAnalyticsFeature` and `analyticsRouter`.
    - Controllers no longer import application classes statically; they use injected feature instances.

---

## Feature: auth

### Goals

- Own all auth-specific DTO/validation logic inside the feature.
- Keep controllers/mappers fully encapsulated without reaching into shared directories.

### Tasks

- [x] **AUTH-01 – Move Zod schemas into auth feature** (addresses finding AUTH-01 & G-02)
  - Description: Create `schema.zod.ts` (or similar) under `infrastructure/http` containing register/login/update payload validators and replace imports from `@/types/api`.
  - Affected Files: `src/features/auth/infrastructure/http/router.ts`, new schema file, `src/features/auth/infrastructure/http/schema.zod.ts`.
  - Steps:
    1. Copy existing schemas into the feature, add tests if needed.
    2. Update `validate(...)` calls to point to the new exports.
    3. Deprecate/remove the shared schema file (leave placeholders if other features still import it).
  - Acceptance Criteria:
    - Auth router imports validators from within `src/features/auth`.
    - Shared `auth schema.ts` no longer required for auth endpoints.

- [x] **AUTH-02 – Localize user response DTO/mappers** (addresses finding AUTH-02 & G-02)
  - Description: Move `toUserResponseDTO` and related DTO types into the auth feature, keeping controllers independent from `@/utils`.
  - Affected Files: `src/features/auth/infrastructure/http/controller.ts`, new mapper/dto files, `src/utils/mappers/user.mapper.ts`.
  - Steps:
    1. Duplicate/relocate mapper logic under `auth/infrastructure/http`.
    2. Update controllers/tests to consume the local mapper.
    3. If other features need the shared mapper, re-export from the new location or keep a thin wrapper referencing the auth module.
  - Acceptance Criteria:
    - Auth controllers have no imports from `@/utils/mappers/user.mapper`.
    - DTO definitions reside inside the auth feature.

---

## Feature: metric

### Goals

- Application queries and use-cases go through `MetricRepository`/read ports only.
- Shared helpers (`findOwnedMetric`, `toDomainMetric`) are absorbed into the feature.
- DTO mapping happens within the feature boundary.

### Tasks

- [x] **M-01 – Convert ListMetrics to use read port** (addresses finding M-01 & G-01)
  - Description: Refactor `ListMetrics` so it depends on a `MetricReadRepository` interface implemented under infrastructure, eliminating direct Sequelize usage.
  - Affected Files: `src/features/metric/application/queries/ListMetrics.ts`, new read port + adapter files, router/services referencing the query.
  - Steps:
    1. Define the port interface describing list operations and cursor pagination.
    2. Implement the adapter using existing SQL/Sequelize logic.
    3. Update the query to accept the port and remove ORM imports.
  - Acceptance Criteria:
    - No Sequelize imports remain in `ListMetrics`.
    - Query is unit-testable with a mock port.

- [x] **M-02 – Move GetMetricDetail data access behind repository** (addresses finding M-02 & G-01)
  - Description: Extend the domain repository (or add read port) with a `findDetailedById` method implemented in infrastructure.
  - Affected Files: `src/features/metric/application/queries/GetMetricDetail.ts`, `domain/repositories/MetricRepository.ts`, infrastructure adapters.
  - Steps:
    1. Add the necessary method signature(s) to the repository/port.
    2. Implement the adapter handling includes and mapping to domain objects.
    3. Update the query to call the port and drop references to `models` and `AppError`.
  - Acceptance Criteria:
    - Query imports only the repository/port.
    - Domain-level logic (authorization, mapping) handled within feature boundaries.

- [x] **M-03 – Absorb shared helpers into MetricRepository** (addresses finding M-03)
  - Description: Replace `findOwnedMetric`/`toDomainMetric` imports with repository operations returning domain aggregates.
  - Affected Files: `src/features/metric/application/use-cases/UpdateMetric.ts`, `src/utils/db-helper.ts`, `src/utils/mappers/metric.mapper.ts`, repository adapters.
  - Steps:
    1. Add repository methods for fetching/updating owned metrics.
    2. Move mapper logic into the repository adapter (or dedicated mapper under the feature).
    3. Update use-cases/tests to rely on the repository exclusively.
  - Acceptance Criteria:
    - `UpdateMetric` has no dependencies on shared helpers.
    - Repository unit/integration tests cover the new operations.

---

## Feature: metric-category

### Goals

- Application layer hosts all mutations/queries; controllers never touch infrastructure directly.
- Reads follow CQRS naming conventions (`application/queries`).

### Tasks

- [x] **MC-01 – Add GenerateDummyCategories use-case** (addresses finding MC-01)
  - Description: Create a use-case that wraps factory + repository + cache invalidation so the HTTP layer no longer manipulates models/cache directly.
  - Affected Files: `src/features/metric-category/infrastructure/http/controller.ts`, new `application/use-cases/GenerateDummyCategories.ts`, `feature.ts`.
  - Steps:
    1. Implement the use-case leveraging the existing `MetricCategoryFactory`, repository, and cache port.
    2. Update the controller to invoke the use-case and remove direct `models` usage.
    3. Add tests covering the new use-case.
  - Acceptance Criteria:
    - Controller only interacts with the feature API.
    - Cache invalidation remains centralized inside the use-case or cache port.

- [x] **MC-02 – Split read flows into `application/queries`** (addresses finding MC-02)
  - Description: Move `ListCategories`/`GetCategory` into a `queries` folder (renaming classes as needed) to match the CQRS layout.
  - Affected Files: `src/features/metric-category/application/use-cases/*.ts`, new `application/queries/`.
  - Steps:
    1. Create the `queries` directory and move read-only classes.
    2. Update imports in controllers/tests/feature builder.
    3. Adjust documentation referencing their new location.
  - Acceptance Criteria:
    - `application/use-cases` contains only mutating flows.
    - Build/test succeed with updated imports.

---

## Feature: metric-log

### Goals

- Cursor queries abstracted via read port adapters; DTO shaping handled in HTTP layer.
- Feature owns its DTO/schema definitions without relying on shared folders.

### Tasks

- [x] **ML-01 – Create MetricLogQueryPort** (addresses finding ML-01 & G-01)
  - Description: Define a read port for cursor pagination and move Sequelize logic/mappers into an adapter.
  - Affected Files: `src/features/metric-log/application/queries/ListMetricLogs.ts`, new `application/ports/MetricLogQueryPort.ts`, infrastructure adapter.
  - Steps:
    1. Specify the port interface returning domain objects or DTOs expected by the controller.
    2. Implement the adapter using existing logic and keep DTO transformation out of the application layer.
    3. Update the `ListMetricLogs` use case to depend on the port.
  - Acceptance Criteria:
    - No DTO or Sequelize imports remain in `application/queries`.
    - Feature builder wires the new adapter.

- [x] **ML-02 – Localize DTOs + Zod schemas** (addresses finding ML-02 & G-02)
  - Description: Move response DTOs, request DTOs, and list schemas under the metric-log feature.
  - Affected Files: `src/features/metric-log/infrastructure/http/controller.ts`, new `dto.ts`, `schema.zod.ts`, `mappers.ts`, shared DTO modules.
  - Steps:
    1. Copy DTO/schemas from `@/types` and mapper logic from `@/utils` into the feature.
    2. Update controller imports and remove reliance on external DTO directories.
    3. Clean up shared DTO exports or re-export from the new location.
  - Acceptance Criteria:
    - Controllers only import DTO/mappers from `src/features/metric-log`.
    - Shared folders no longer contain metric-log-specific payloads.

---

## Feature: metric-settings

### Goals

- Feature-scoped DTOs/validators/mappers for all endpoints.
- Cache invalidation + ownership logic remain encapsulated via ports/use-cases.

### Tasks

- [x] **MS-01 – Move MetricSettings DTO/mappers into feature** (addresses finding MS-01 & G-02)
  - Description: Create local DTO + mapper files and update controllers to consume them instead of shared helpers.
  - Affected Files: `src/features/metric-settings/infrastructure/http/controller.ts`, new `dto.ts`/`mappers.ts`, `src/utils/mappers/metric-settings.mapper.ts`.
  - Steps:
    1. Relocate mapper logic and DTO definitions under the feature.
    2. Update all imports to reference the new files.
    3. Provide optional re-exports for backward compatibility if other modules depend on these DTOs.
  - Acceptance Criteria:
    - Controller imports only feature-local DTO/mappers.
    - Shared mapper file removed or reduced to a thin wrapper referencing the feature.

- [x] **MS-02 – Add Zod schemas for metric-settings endpoints** (addresses finding MS-02 & G-02)
  - Description: Define Zod schemas for create/update/list/display options endpoints and enforce them via the shared `validate` helper.
  - Affected Files: `src/features/metric-settings/infrastructure/http/controller.ts`, new `schema.zod.ts`, router wiring.
  - Steps:
    1. Capture existing request shapes in schemas.
    2. Update router/controller to use `validate`/`pickValidated` with the new schemas instead of manual casts.
    3. Add tests covering validation edge cases.
  - Acceptance Criteria:
    - No `req.body as DTO` casts remain.
    - Validation errors follow consistent formatting.

---

## Feature: shared

### Goals

- Clarify whether shared helpers remain under `src/features` or move to a dedicated shared module.
- Ensure any remaining shared slice follows the canonical feature layout.

### Tasks

- [x] **SH-01 – Re-home shared utilities** (addresses finding SH-01)
  - Description: Decide whether middleware such as `cache`, `rate-limiter`, and `validated` belong inside a proper feature slice or under a global `shared/` folder, then restructure accordingly.
  - Affected Files: `src/shared/middleware/**/*`, possibly new `src/shared` (or multiple small features).
  - Steps:
    1. Inventory the helpers and identify their consumers.
    2. Either (a) move them out of `src/features` into `src/shared`, or (b) restructure into feature-like modules with domain/application/infrastructure layering.
    3. Update imports throughout the repo.
    4. Document the new ownership model in the architecture overview.
  - Acceptance Criteria:
    - `src/shared/middleware` no longer violates the canonical layout.
    - Documentation explains where to add future shared helpers.

---

## Delivery Governance

- **Dependency Tracking:** note upstream/downstream relationships (e.g., `AUTH-02` blocked by `G-01`).
- **Testing Expectations:** list automated tests or manual verification steps when relevant.
- **Review Notes:** capture any deviations from plan or rationale for deprioritizing findings.
