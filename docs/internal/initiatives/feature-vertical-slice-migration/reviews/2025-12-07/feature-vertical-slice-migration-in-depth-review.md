# Feature Vertical Slice Migration – In-Depth Review

> Generated with Codex using `feature-vertical-slice-migration-review-overview.md` as the architectural contract.  
> Supporting references:
>
> - `docs/internal/initiatives/feature-vertical-slice-migration/checklists/feature-vertical-slice-migration-checklist.md`
> - `docs/internal/initiatives/feature-vertical-slice-migration/plans/feature-vertical-slice-migration-plan.md`

## How to Use This Document

1. Inspect the feature’s code under `src/features/<name>` plus shared dependencies.
2. Capture observations under **Summary** (narrative) and **Strengths** (what already matches the pattern).
3. Record every deviation as a **Finding** with a stable ID and severity.
4. Link back to files + lines and reference supporting screenshots/logs if needed.
5. Once completed for all features, hand this document to the planning phase.

### Severity Scale

| Level       | Definition                                                  | Action Expectation                                |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------- |
| **Blocker** | Prevents migration or causes critical production risk       | Must be addressed before Gold review              |
| **High**    | Significant drift that risks maintainability or correctness | Include in stabilization plan                     |
| **Medium**  | Non-blocking but notable inconsistency                      | Plan if effort is low / combine with related work |
| **Low**     | Cosmetic or documentation gaps                              | Optional; note for later                          |

### Finding Template

Use the following structure for each finding:

```
- **<ID> – <concise title>**
  - Severity: Blocker | High | Medium | Low
  - Description: ...
  - Impact: ...
  - Suggested Direction: ...
  - Evidence: `path/to/file.ts:123` (link or summary)
```

### Global Observations

Capture issues that span multiple features here.

```markdown
- **G-01 – Application layer still depends on Sequelize models**
  - Severity: High
  - Description: Multiple features route read models directly through `sequelize` or `models` inside the application layer instead of ports/adapters, so the “use case/query” code is tightly coupled to a specific ORM and raw SQL.
  - Impact: Makes CQRS boundaries leaky, blocks swapping persistence engines, and forces tests to boot Sequelize rather than stub repositories.
  - Suggested Direction: Introduce query/read repositories per feature (or slice-specific ports) and have the application layer depend only on those interfaces; hide raw SQL in infrastructure.
  - Evidence: `src/features/analytics/application/queries/GetDashboardVisualization.ts:1-21`, `src/features/metric/application/queries/ListMetrics.ts:1-20`, `src/features/metric-log/application/queries/ListMetricLogs.ts:1-6`
```

---

## Feature: analytics

### Summary

Analytics still mixes legacy service patterns (raw SQL + Redis cache helpers) with the new vertical-slice layout. Queries execute SQL directly via Sequelize, caching is wired to a concrete Redis helper, and there is no `feature.ts` composition point, so controllers call static functions.

### Strengths

- Domain-centric helpers (`domain/buckets.ts`, `domain/fallback-range.ts`) consolidate complex time-bucket logic.
- Presentation validators (`infrastructure/http/validators.ts`) enforce nuanced query constraints (date ranges, time zones, relative windows).

### Findings

- **AN-01 – Queries import Sequelize and raw SQL directly**
  - Severity: High
  - Description: `getDashboardVisualization` imports `sequelize`, `QueryTypes`, and SQL builders from `infrastructure/sql` inside the application layer.
  - Impact: The query cannot be tested or reused without booting the DB layer, and it violates the “application depends on ports only” rule from the standard.
  - Suggested Direction: Define a query/read port (e.g., `VisualizationReadRepository`) and move the SQL + Sequelize dependency into an adapter under `infrastructure`.
  - Evidence: `src/features/analytics/application/queries/GetDashboardVisualization.ts:1-21`

- **AN-02 – Cache access bypasses a CachePort**
  - Severity: Medium
  - Description: The same query calls `vizDashKey`, `getCachedViz`, and `setCachedViz` from `infrastructure/cache/vizCache` directly instead of going through a cache port.
  - Impact: Couples the application layer to Redis-specific semantics (key formats, TTL) and prevents swapping cache providers or faking cache access in tests.
  - Suggested Direction: Introduce a feature-specific `CachePort` (similar to metric/metric-log) and inject it into queries so infrastructure owns key generation and invalidation.
  - Evidence: `src/features/analytics/application/queries/GetDashboardVisualization.ts:10-14`

- **AN-03 – No feature builder or canonical HTTP layer**
  - Severity: Medium
  - Description: There is no `feature.ts`/`index.ts`; controllers under `infrastructure/http` import application functions directly and manually wire env-specific constants.
  - Impact: Prevents dependency injection (cannot swap cache adapters per test) and diverges from the canonical `infrastructure/http` naming/layout used elsewhere.
  - Suggested Direction: Add `feature.ts` that instantiates cache/read adapters, expose routers via `infrastructure/http`, and have controllers depend on that feature contract.
  - Evidence: `src/features/analytics/infrastructure/http/visualization.controller.ts:1-22`

---

## Feature: auth

### Summary

Auth is close to the target slice: domain entities, ports (PasswordHasher/TokenProvider), a `feature.ts`, and HTTP wiring live inside the feature. Remaining gaps are mostly DTO/validator ownership.

### Strengths

- Feature builder wires concrete adapters (`UserRepositorySequelize`, `BcryptPasswordHasher`, `JwtTokenProvider`) cleanly.
- Use-cases depend purely on domain repositories and ports, keeping infrastructure out of the application layer.

### Findings

- **AUTH-01 – Zod schemas live in global `/types` instead of the feature**
  - Severity: Medium
  - Description: The router pulls validators from `@/features/auth/infrastructure/http/schema.zod` rather than a feature-local schema module, unlike other slices.
  - Impact: Changes to auth validation now require editing a global types directory, increases coupling, and makes it harder to reason about feature ownership.
  - Suggested Direction: Move/create Zod schemas under `src/features/auth/infrastructure/http` (or `infrastructure/http`) and update `validate(...)` calls to use them.
  - Evidence: `src/features/auth/infrastructure/http/router.ts:12-19`

- **AUTH-02 – Controllers rely on shared user DTO/mappers**
  - Severity: Low
  - Description: `controller.ts` imports `toUserResponseDTO` from `@/utils/mappers/user.mapper` and shared types instead of a feature-owned DTO/mapping layer.
  - Impact: Limits auth’s ability to evolve its response contract independently and keeps DTO transformations outside the feature boundary.
  - Suggested Direction: Copy/relocate the mapper + response DTO into `src/features/auth/infrastructure/http` (or `application/dto`) so the slice owns its transport shape.
  - Evidence: `src/features/auth/infrastructure/http/controller.ts:1-6`

---

## Feature: metric

### Summary

Metric has partial verticalization (feature builder, cache/transaction ports) but read paths and DTOs still depend heavily on legacy global helpers and Sequelize models.

### Strengths

- `feature.ts` wires repositories, cache, and transaction ports, making mutation use-cases easy to compose.
- Domain entity (`domain/entities/Metric.ts`) and repository interface encapsulate create semantics.

### Findings

- **M-01 – `ListMetrics` query depends on global models and mappers**
  - Severity: High
  - Description: The query imports `models` from `@/infrastructure/db/models`, `Sequelize` internals, and DTO mappers from `@/utils`.
  - Impact: Violates the application-layer boundary, making it impossible to stub persistence and forcing CQRS logic to live alongside ORM specifics.
  - Suggested Direction: Introduce a read/query repository under `application/queries` that defines a port implemented inside `infrastructure/persistence`, similar to write repos.
  - Evidence: `src/features/metric/application/queries/ListMetrics.ts:1-24`

- **M-02 – `GetMetricDetail` bypasses ports and performs ORM logic inline**
  - Severity: High
  - Description: This class constructs Sequelize includes and invokes `models.Metric.findOne` directly, even though the feature already defines repositories.
  - Impact: Couples the use-case to Sequelize, leaks include shapes into the application layer, and duplicates mapping logic (`toExtendedMetricDomain`) from shared utils.
  - Suggested Direction: Extend `MetricRepository` (or add a dedicated query port) that exposes `findDetailedById`, moving include/mapping logic into infrastructure adapters.
  - Evidence: `src/features/metric/application/queries/GetMetricDetail.ts:1-40`

- **M-03 – Update logic uses shared helpers instead of repositories**
  - Severity: Medium
  - Description: `UpdateMetric` calls `findOwnedMetric` from `@/utils/db-helper` and `toDomainMetric` from shared mappers, bypassing the repository defined in the feature.
  - Impact: Encourages other slices to depend on legacy helpers, scatters transaction handling, and blocks enforcing invariants inside the domain entity.
  - Suggested Direction: Add `findOwnedMetric`/`save` operations to `MetricRepository`, map ORM rows to domain objects inside the adapter, and remove dependencies on shared helpers.
  - Evidence: `src/features/metric/application/use-cases/UpdateMetric.ts:1-22`

---

## Feature: metric-category

### Summary

Metric-category is mostly aligned (rich domain model, cache port, persistence repo) but the HTTP layer still reaches into infrastructure for certain routes and read flows stay in `use-cases`.

### Strengths

- Domain entity leverages value objects (`MetricCategoryName`, `MetricCategoryColor`, `MetricCategoryIcon`) to enforce invariants.
- Cache port and repository abstractions are injected via `feature.ts`, enabling reuse across list/create/update/delete flows.

### Findings

- **MC-01 – Dummy endpoint bypasses the application layer**
  - Severity: Medium
  - Description: `generateDummyCategories` instantiates `MetricCategoryFactory`, writes directly through `models.MetricCategory`, and invalidates Redis via `MetricCategoryCacheRedis` inside the controller.
  - Impact: Breaks layering (HTTP -> infrastructure) and duplicates persistence logic, so changes to repositories/cache invalidation won’t apply to this route.
  - Suggested Direction: Add an explicit use-case (e.g., `GenerateDummyCategories`) that depends on the repository + cache port, and have the controller call that use-case instead of touching infrastructure.
  - Evidence: `src/features/metric-category/infrastructure/http/controller.ts:54-107`

- **MC-02 – Read operations live under `use-cases` instead of `queries`**
  - Severity: Low
  - Description: Both `ListCategories` and `GetCategory` are implemented in `application/use-cases`, and there is no `application/queries` directory.
  - Impact: Diverges from the canonical CQRS layout documented in the overview, making it harder to locate reads vs writes consistently across features.
  - Suggested Direction: Move read-only flows into `application/queries` (or at least separate namespaces) and keep `use-cases` for mutations to align with the standard.
  - Evidence: `src/features/metric-category/application/use-cases/ListCategories.ts:1-22`, `src/features/metric-category/application/use-cases/GetCategory.ts:1-15`

---

## Feature: metric-log

### Summary

Metric-log owns its mutation flows (create/update/delete/stats) but cursor listing and DTO handling still live in legacy shared modules, so the slice isn’t fully self-contained.

### Strengths

- Domain entity (`MetricLog`) guards value ranges and timestamp validity.
- Cache and metric-access ports decouple write flows from Redis + ownership checks.

### Findings

- **ML-01 – Cursor query ties directly to shared DTOs and ORM models**
  - Severity: High
  - Description: `ListMetricLogs.ts` imports `models`, DTOs, mappers, and Sequelize operators inside the application folder instead of delegating to an adapter.
  - Impact: Forces consumers to pull in Sequelize + global DTOs for any read, and makes pagination logic impossible to reuse across persistence strategies.
  - Suggested Direction: Define a `MetricLogQueryPort` that returns domain objects, implement it in `infrastructure/persistence`, and move DTO conversion to the HTTP layer.
  - Evidence: `src/features/metric-log/application/queries/ListMetricLogs.ts:1-6`

- **ML-02 – HTTP layer depends on global DTO/schema modules**
  - Severity: Medium
  - Description: The controller imports `toMetricLogResponseDTO` and `GenerateDummyMetricLogsRequestDTO` from `@/utils`/`@/types`, plus the Zod schema from `src/types/api`.
  - Impact: Prevents the feature from evolving its transport layer independently, and spreads API contracts across unrelated directories.
  - Suggested Direction: Move DTOs/mappers/Zod schemas into `src/features/metric-log/infrastructure/http` (or `infrastructure/http`) and re-export them via the feature to keep ownership local.
  - Evidence: `src/features/metric-log/infrastructure/http/controller.ts:9-18`

---

## Feature: metric-settings

### Summary

Metric-settings has a solid domain + repository setup, yet its HTTP layer still relies on shared DTOs/mappers and lacks feature-owned validation for request payloads/query params.

### Strengths

- Repository interface encapsulates cursor pagination while use-cases remain thin.
- Cache invalidation and metric-ownership ports are injected through `feature.ts`, encouraging clear boundaries.

### Findings

- **MS-01 – Controllers use shared DTOs/mappers**
  - Severity: Medium
  - Description: `controller.ts` imports `toMetricSettingsResponseDTO`/`toDisplayOptionsResponseDTO` and DTO types from `@/utils` and `@/types/dtos`.
  - Impact: Couples the feature to shared folders, so modifying response shapes requires edits outside the slice and risks breaking other consumers of the shared mapper.
  - Suggested Direction: Relocate the DTO + mapper definitions into the metric-settings feature (e.g., under `infrastructure/http/dto.ts` and `infrastructure/http/mappers.ts`) and update imports accordingly.
  - Evidence: `src/features/metric-settings/infrastructure/http/controller.ts:1-16`

- **MS-02 – No feature-owned validation for HTTP payloads**
  - Severity: Medium
  - Description: Request bodies/queries are parsed with plain `req.body as DTO` casts and manual coercion instead of Zod schemas under the feature.
  - Impact: Increases risk of invalid data reaching use-cases and diverges from the standard that keeps DTO/Zod placement inside each feature’s presentation layer.
  - Suggested Direction: Add Zod schemas under `src/features/metric-settings/infrastructure/http` (e.g., `schema.zod.ts`) and reuse the shared `validate` helper so controllers never cast `req.body` manually.
  - Evidence: `src/features/metric-settings/infrastructure/http/controller.ts:20-75`

---

## Feature: shared

### Summary

`src/shared/middleware` currently serves as a grab bag of middleware/utilities (cache, rate limiter, validation) rather than a structured feature slice with domain/application layers.

### Strengths

- Centralizes widely used middleware such as `rate-limiter` and validation helpers to avoid duplication across routers.

### Findings

- **SH-01 – Shared “feature” does not follow the canonical layout**
  - Severity: Medium
  - Description: Files like `cache.ts` export Express middleware that touch Redis/loggers directly, but there is no `feature.ts`, domain, or application structure under `src/shared/middleware`.
  - Impact: Encourages other features to import generic utilities from an ad-hoc folder, making ownership unclear and complicating dependency tracking during audits.
  - Suggested Direction: Either promote these helpers to a top-level `shared/` module (outside `features`) or refactor them into proper slices (e.g., `shared-cache` with application/infrastructure folders) so they align with the standard layout.
  - Evidence: `src/shared/middleware/cache.ts:1-40`
