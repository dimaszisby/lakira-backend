# Feature Vertical Slice Migration – Stabilize Feature Pattern Checklist

> Companion to `feature-vertical-slice-migration-stabilize-feature-pattern-plan.md`.  
> Use this checklist to track granular completion status for every task derived from the in-depth review. Cross-reference the plan for descriptions/acceptance criteria.

## How to Use

1. Keep this document in sync with the stabilization plan tasks.
2. Mark `[x]` when a sub-step is complete; add notes/dates/links as needed.
3. If scope changes, update both the plan and this checklist.

---

## Global / Cross-Cutting

- [x] **G-01 – Standardize read/query port pattern**
  - [x] Define read/query port interfaces per feature.
  - [x] Implement adapters moving all Sequelize/SQL into infrastructure.
  - [x] Update application queries to depend on the new ports.
  - [x] Add unit tests for queries using port stubs. `__tests__/features/{analytics|metric|metric-log}/application`
  - [x] Add integration tests for adapters. `__tests__/features/{analytics|metric}/infrastructure/persistence`
- [x] **G-02 – Localize DTOs and validation under each feature**
  - [x] Create feature-scoped DTO + schema files.
  - [x] Update routers/controllers to use local definitions.
  - [x] Remove/replace references from shared `@/types`/`@/utils`.
  - [x] Document new ownership paths.

---

## Analytics

- [x] **AN-01 – Introduce VisualizationReadRepository**
  - [x] Create interface in `application/ports`.
  - [x] Implement adapter in `infrastructure/persistence`.
  - [x] Refactor `getDashboardVisualization` to inject the port.
  - [x] Update feature builder and tests.
- [x] **AN-02 – Wrap cache access behind CachePort**
  - [x] Define cache port interface.
  - [x] Implement Redis adapter.
  - [x] Inject cache port via feature builder.
  - [x] Cover cache ops with tests/docs.
- [x] **AN-03 – Add feature builder + canonical HTTP layer**
  - [x] Create `feature.ts` + `index.ts`.
  - [x] Move/rename HTTP files under `infrastructure/http`.
  - [x] Update controllers to use injected feature dependencies.
  - [x] Adjust imports/docs referencing analytics endpoints.

---

## Auth

- [x] **AUTH-01 – Move Zod schemas into auth feature**
  - [x] Create local schema file.
  - [x] Update router to use local validators.
  - [ ] Remove dependency on `@/features/auth/infrastructure/http/schema.zod`.
  - [ ] Add tests for validation edge cases.
- [x] **AUTH-02 – Localize user response DTO/mappers**
  - [ ] Create feature-local DTO + mapper file.
  - [ ] Update controller/test imports.
  - [ ] Deprecate/remove shared mapper exports.

---

## Metric

- [x] **M-01 – Convert ListMetrics to use read port**
  - [x] Define `MetricReadRepository`.
  - [x] Implement adapter with Sequelize logic.
  - [x] Refactor query + tests.
- [x] **M-02 – Move GetMetricDetail data access behind repository**
  - [x] Extend repository/port for `findDetailedById`.
  - [x] Implement adapter and update query.
  - [x] Cover behavior with tests.
- [x] **M-03 – Absorb shared helpers into MetricRepository**
  - [x] Migrate helper logic into repository adapter.
  - [x] Update use-cases to rely solely on repository.
  - [x] Remove deprecated helpers from `@/utils`.

---

## Metric Category

- [x] **MC-01 – Add GenerateDummyCategories use-case**
  - [x] Implement new use-case using factory + repo + cache.
  - [x] Update controller to call the use-case.
  - [x] Add tests verifying cache invalidation. `__tests__/features/metric-category/application/GenerateDummyCategories.test.ts`
- [x] **MC-02 – Split read flows into `application/queries`**
  - [x] Move read classes to `application/queries`.
  - [x] Update imports/feature builder.
  - [x] Document the new structure.

---

## Metric Log

- [x] **ML-01 – Create MetricLogQueryPort**
  - [x] Define port interface.
  - [x] Implement adapter moving Sequelize logic out of `application`.
  - [x] Refactor query + tests.
- [x] **ML-02 – Localize DTOs + Zod schemas**
  - [x] Move DTO/mappers/schemas under feature.
  - [x] Update controller imports.
  - [x] Remove shared DTO/schema usage.

---

## Metric Settings

- [x] **MS-01 – Move DTO/mappers into feature**
  - [x] Create local DTO + mapper files.
  - [x] Update controllers/tests.
  - [x] Remove shared mapper exports.
- [x] **MS-02 – Add Zod schemas for metric-settings endpoints**
  - [x] Create schema file for create/update/list/display options.
  - [x] Ensure router/controllers use `validate`/`pickValidated`.
  - [x] Add validation tests. `__tests__/features/metric-settings/infrastructure/http/schema.zod.test.ts`

---

## Shared

- [x] **SH-01 – Re-home shared utilities**
  - [x] Inventory consumers and decide on final placement.
  - [x] Move/restructure helpers accordingly.
  - [x] Update imports + docs to reflect the change.
