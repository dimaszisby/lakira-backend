# Phase: DDD Layout Drift Cleanup

- Timestamp: 2026-05-03T00:00:00Z
- Closes audit gaps: [P1] 10.1, [P1] 10.2, [P2] 10.4, [P2] 10.5 in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`
- Gated by: ADR-003 in `docs/internal/audits/saas-readiness/decisions.md` (canonical DDD layout — must be Accepted before work starts)

## Context & Goals

The SaaS-readiness audit found five concrete layout drifts across feature slices, Sequelize types leaking into the application layer, inconsistent `buildXFeature()` signatures, and dead code (`src/features/admin/`, `src/utils/mappers/`). These inconsistencies make the codebase harder to fork and onboard onto.

This phase brings every feature slice into alignment with the canonical layout defined in `.claude/rules/architecture.md` and ADR-003, then adds an architecture test to prevent regression.

Note: [P1] 10.3 (auth middleware reimplements `jwt.verify`) is addressed in the JWT kit (`docs/internal/initiatives/jwt/`) Phase D, not here.

## Phase A — Metric slice cleanup

**Goal:** Align `src/features/public/metric/` with the canonical layout.

1. **Create `dto.ts`** in `metric/infrastructure/http/` — extract DTO mapping out of `src/utils/mappers/metric.mapper.ts`.
2. **Consolidate transaction ports** — `metric/application/ports/` has both `PersistenceTransaction.ts` and `TransactionPort.ts`. Pick the canonical one (per ADR-003 in this kit's `decisions.md`), update import sites, delete the other.
3. **Move legacy mapper** — relocate `src/utils/mappers/metric.mapper.ts` into `metric/infrastructure/persistence/mappers/` and update all import paths.
4. Verify: `npx jest --selectProjects unit integration -- metric`.

## Phase B — Metric-log slice cleanup

**Goal:** Fix non-standard directory naming.

1. **Rename `infrastructure/access/`** → `infrastructure/providers/` (to match the cross-feature provider convention used by other slices).
2. **Update imports** — all files referencing `metric-log/infrastructure/access/MetricAccessSequelize` must point to the new path.
3. Verify: `npx jest --selectProjects unit integration -- metric-log`.

## Phase C — Metric-settings slice cleanup

**Goal:** Remove mapper duplication and directory inconsistency.

1. **Move `infrastructure/mappers/`** contents into `infrastructure/persistence/mappers/` (canonical location).
2. **Delete duplicate `MetricAccessSequelize`** — `metric-settings/infrastructure/providers/MetricAccessSequelize.ts` duplicates the same port adapter that lives in `metric-log`. One canonical adapter should live in the feature that owns it (or in `shared/`), with the other feature importing via a cross-feature port.
3. **Update `buildMetricSettingsFeature()`** import paths.
4. Verify: `npx jest --selectProjects unit integration -- metric-settings`.

## Phase D — Analytics slice cleanup

**Goal:** Bring the most divergent slice closer to the canonical structure.

1. **Rename `validators.ts`** → `schema.zod.ts` (matches every other slice).
2. **Convert `getMetricTrend.ts`** to a PascalCase class `GetMetricTrend.ts` with an `execute()` method (matches query convention in `GetMetricLogStats`, `GetAnalyticsDashboard`, etc.).
3. **Remove `sequelize` import from `getMetricTrend.ts`** — the `Op` import belongs in the repository adapter, not the application query. Introduce a `TrendQueryCriteria` port type if needed.
4. **Evaluate raw SQL files** (`infrastructure/sql/*.sql.ts`) — decide whether to keep as-is (acceptable: infrastructure layer) or extract into the repository. Not a blocking drift since they're in the infrastructure layer.
5. Verify: `npx jest --selectProjects unit integration -- analytics`.

## Phase E — Sequelize types in application layer [P1-10.2]

**Goal:** Remove ORM coupling from the application layer.

1. **`metric-log/application/queries/GetMetricLogStats.ts`** — replace `FindOptions`, `Includeable`, `WhereOptions` imports with a domain-owned `MetricLogQueryCriteria` port type. Translate to Sequelize types inside the repository adapter.
2. **`analytics/application/queries/getMetricTrend.ts`** — the `Op` import is handled in Phase D step 3. If already converted to a class, verify the application-layer file has zero `sequelize` imports.
3. Verify: `grep -r "from ['\"]sequelize" src/features/*/application/` returns zero matches.

## Phase F — Manual DI consistency [P2-10.4]

**Goal:** Every `buildXFeature()` accepts a dependency-overrides bag.

1. **Add overrides parameter** to `buildMetricCategoryFeature()`, `buildMetricSettingsFeature()`, `buildAnalyticsFeature()` — mirror the signature used by `buildAuthFeature()`, `buildMetricFeature()`, `buildMetricLogFeature()`.
2. **Type the overrides bag** — partial record of port interfaces.
3. Verify: unit tests can inject mock ports via the overrides bag for all six features.

## Phase G — Dead code removal [P2-10.5]

**Goal:** Remove empty placeholders and orphaned legacy directories.

1. **Delete `src/features/admin/`** — empty directory with no tracked files. Remove from `tsconfig.json` path aliases if referenced.
2. **Move remaining legacy mappers** in `src/utils/mappers/` — `generic.mapper.ts` to `src/shared/` or the appropriate feature; `metric-log.mapper.ts` into `metric-log/infrastructure/persistence/mappers/`. `metric.mapper.ts` should already be moved in Phase A.
3. **Delete `src/utils/mappers/`** once empty.
4. Verify: `ls src/utils/mappers/` fails (directory gone); `ls src/features/admin/` fails (directory gone).

## Phase H — Architecture enforcement test

**Goal:** Prevent future drift via CI.

1. **Create `__tests__/unit/architecture.test.ts`** — a Jest test that:
   - Scans `src/features/` for all feature directories.
   - Asserts each has `domain/`, `application/`, `infrastructure/` subdirectories (except analytics, which has no domain — decide whether to exempt or add a minimal domain).
   - Asserts no `application/` file imports from `sequelize`.
   - Asserts every `buildXFeature()` accepts a partial overrides parameter (signature check via AST or grep).
   - Asserts no files exist in `src/utils/mappers/`.
2. Add to the `unit` Jest project; runs on every CI push.
3. Verify: `npx jest --selectProjects unit -- architecture`.

## Dependencies & Risks

- **ADR-003 gate:** Phase work must not start until the canonical layout ADR is flipped to Accepted.
- **Cross-feature port changes** (Phases B, C) touch import paths across multiple slices — run full `npm test` after each phase.
- **Analytics is the most divergent slice** — Phase D may surface additional inconsistencies. Timebox and log anything out-of-scope.
- **Existing tests must not break** — every phase ends with a test run proving green.

## References

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md` § 10.1–10.5
- `.claude/rules/architecture.md` — canonical layout definition
- `docs/internal/audits/saas-readiness/decisions.md` ADR-003 (canonical DDD layout)
- `docs/internal/initiatives/feature-vertical-slice-migration/plans/feature-vertical-slice-migration-plan.md` — original migration plan (Phases 1–4)
