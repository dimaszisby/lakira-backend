## Metric Category Feature Migration Plan

- Timestamp: 2025-12-04T12:10:00Z

### Background

- Metric Category still relies on legacy services/controllers (`legacies/MetricCategoryLegacy.*`) even though other domains now follow the domain/application/infrastructure slice pattern.
- The router has been moved under the feature (`infrastructure/http/router.ts`), so the remaining work is to replace the legacy service layer with proper domain + application modules and to retire the legacy mapper/service files.

### Goals

1. Model the domain (entities/value objects) plus repositories that wrap the Sequelize model.
2. Expose application use cases that cover CRUD + cursor listing (matching today’s API contracts).
3. Align infrastructure adapters (HTTP handlers, cache, queue hooks) to call the new use cases.
4. Remove the legacy service/controller files once feature parity + tests are in place.

### Work Breakdown

1. **Domain Layer**
   - Define `MetricCategory` aggregate + value objects (e.g., `CategoryName`, `CategoryColor`).
   - Add repository interface describing CRUD + cursor listing requirements (with filter support).
   - Capture invariants (ownership, soft delete) inside the aggregate.
2. **Application Layer**
   - Implement use cases: `CreateCategory`, `ListCategoriesViaCursor`, `GetCategoryDetail`, `UpdateCategory`, `DeleteCategory`, `GenerateDummyCategories`.
   - Define ports for dependencies: `CategoryRepository`, `MetricRepository` (for ownership checks), `CacheInvalidationPort`.
   - Move validation/conversion logic out of legacy service into DTO mappers near the use cases.
3. **Infrastructure Layer**
   - Build `MetricCategoryRepoSequelize` (wrapping the feature-owned Sequelize model).
   - Replace legacy controller with feature-specific handlers calling the new use cases.
   - Keep router wiring identical; only handler imports change.
   - Update cache adapters to live inside `infrastructure/cache` and reuse `cacheMiddleware`.
4. **Compatibility & Cleanup**
   - Provide temporary shims in `legacies/` (if needed) while new controllers stabilize.
   - Once tests pass, delete `MetricCategoryLegacy.*` files and remove references from router.
   - Update docs/README + tests to reflect the new structure.

### Testing Strategy

- Unit tests for domain entities + use cases.
- Integration tests for repository (Sequelize) and HTTP handlers (router-level).
- Regression suite entry in `phase4-test-log.md` once migration completes.

### Dependencies / Risks

- Categories reference metrics for counts; ensure repository ports handle the association without reintroducing tight coupling.
- Cursor listing uses caches + filters; tests must cover edge cases (includeTotal, filter[name], after cursor).
- Dummy endpoint should remain behind `env.ENABLE_DUMMY_ENDPOINTS`.

### Tracking

- Add checklist items under Phase 4 once implementation starts.
- Reference this plan from `../tracking/phase4-progress.md` so status updates converge here.

### Status – 2025-12-05

- Feature bootstrap: `feature.ts` now composes the Sequelize repo + Redis cache and exposes create/list/get/update/delete use cases.
- HTTP router/controllers now invoke the feature use cases for CRUD flows; the dummy endpoint now uses the feature factory instead of the legacy service.
- Legacy folder retired: `src/features/metric-category/legacies/**` and the deprecated `application/queries` helpers have been removed; downstream mappers/types reference the feature-owned DTOs.
- Follow-up: keep regression coverage fresh and update any docs/tests that previously pointed to the legacy folder (most notably the metric feature README + cross-domain mapper notes).
