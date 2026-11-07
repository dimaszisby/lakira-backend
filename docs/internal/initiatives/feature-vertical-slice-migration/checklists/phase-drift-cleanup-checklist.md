# Phase: DDD Layout Drift Cleanup — Checklist

- Timestamp: 2026-05-03T00:00:00Z
- Plan: `../plans/phase-drift-cleanup-plan.md`
- Closes: [P1] 10.1, [P1] 10.2, [P2] 10.4, [P2] 10.5

## Gating

- [x] ADR-003 in `saas-readiness/decisions.md` flipped Proposed → Accepted.
- [x] Kit-local ADR-001 reviewed.

## Phase A — Metric slice cleanup

- [x] Create `dto.ts` in `metric/infrastructure/http/`.
- [x] Consolidate transaction ports (`PersistenceTransaction.ts` / `TransactionPort.ts` → one canonical port).
- [x] Move `src/utils/mappers/metric.mapper.ts` → `metric/infrastructure/persistence/mappers/`.
- [x] Update all import paths referencing the old location.
- [x] Metric unit + integration tests green.

## Phase B — Metric-log slice cleanup

- [x] Rename `metric-log/infrastructure/access/` → `infrastructure/providers/`.
- [x] Update all imports referencing `infrastructure/access/`.
- [x] Metric-log unit + integration tests green.

## Phase C — Metric-settings slice cleanup

- [x] Move `infrastructure/mappers/` → `infrastructure/persistence/mappers/`.
- [x] Delete duplicate `MetricAccessSequelize` from `metric-settings/infrastructure/providers/`.
- [x] Wire cross-feature port for metric access (import from owning feature or shared).
- [x] Update `buildMetricSettingsFeature()` import paths.
- [x] Metric-settings unit + integration tests green.

## Phase D — Analytics slice cleanup

- [x] Rename `validators.ts` → `schema.zod.ts`.
- [x] Convert `getMetricTrend.ts` → `GetMetricTrend.ts` (PascalCase class with `execute()`).
- [x] Remove `sequelize` import (`Op`) from the application-layer query.
- [x] Evaluate raw SQL files in `infrastructure/sql/` — document decision in kit-local decisions.md.
- [x] Analytics unit + integration tests green.

## Phase E — Sequelize types in application layer

- [x] Replace `FindOptions`, `Includeable`, `WhereOptions` in `GetMetricLogStats.ts` with a domain-owned port type.
- [x] Implement translation layer in the repository adapter.
- [x] Verify: `grep -r "from ['\"]sequelize" src/features/*/application/` returns zero matches.

## Phase F — Manual DI consistency

- [x] Add overrides parameter to `buildMetricCategoryFeature()`.
- [x] Add overrides parameter to `buildMetricSettingsFeature()`.
- [x] Add overrides parameter to `buildAnalyticsFeature()`.
- [x] Type each overrides bag as a partial record of port interfaces.
- [x] Verify: all six features accept mock port injection in tests.

## Phase G ��� Dead code removal

- [x] Delete empty `src/features/admin/` directory.
- [x] Remove `admin` from `tsconfig.json` path aliases if present.
- [x] Move `src/utils/mappers/generic.mapper.ts` to its owning location.
- [x] Move `src/utils/mappers/metric-log.mapper.ts` → `metric-log/infrastructure/persistence/mappers/`.
- [x] Delete `src/utils/mappers/` directory.

## Phase H — Architecture enforcement test

- [x] Create `__tests__/unit/architecture.test.ts`.
- [x] Assert required subdirectories per feature slice.
- [x] Assert no `sequelize` imports in application-layer files.
- [x] Assert all `buildXFeature()` accept overrides.
- [x] Assert `src/utils/mappers/` does not exist.
- [x] Test runs in CI via `unit` Jest project.

## Wrap-up

- [x] `npm run typecheck && npm run lint && npm run format:write && npm test` green.
- [ ] Audit re-run grades 10.1, 10.2, 10.4, 10.5 as Pass.

## Known Debt (follow-up phase)

Pre-existing violations surfaced during code review — not introduced by this phase, deferred to avoid expanding scope.

- [ ] **`GenerateDummyMetrics.ts` imports infrastructure in application layer** —
      `src/features/public/metric/application/use-cases/GenerateDummyMetrics.ts` imports
      from `../../infrastructure/persistence/mappers/MetricReadMapper.js` and
      `@/infrastructure/db/models.js`. Both are infrastructure imports inside an
      application file, violating the DDD dependency rule. Requires extracting a
      port or moving the use-case to infrastructure.

- [ ] **`MetricReadMapper.ts` cross-feature infrastructure imports** —
      `src/features/public/metric/infrastructure/persistence/mappers/MetricReadMapper.ts`
      imports `toDomainMetricSettings` from `metric-settings/infrastructure/persistence/mappers/`
      and `toDomainMetricLog` from `metric-log/infrastructure/persistence/mappers/`.
      These cross-feature internal imports couple infrastructure layers across slices.
      Consider whether sibling features should expose their mappers via a stable
      internal API or whether the composite mapping belongs in the metric feature alone.
