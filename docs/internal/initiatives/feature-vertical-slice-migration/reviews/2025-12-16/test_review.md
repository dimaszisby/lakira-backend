# Lakira Backend Test Review (2025-12-16)

## Recommended Location

This review lives under `docs/internal/initiatives/feature-vertical-slice-migration/reviews/2025-12-16` so it stays co-located with the rest of the migration evidence. The previous review folders follow the same pattern (for example `reviews/2025-12-07` and `reviews/2025-12-14`), and Phase 4 audit logs already reference these directories. Keeping the new docs beside them preserves traceability without inventing a parallel documentation tree.

## Scope

- Inventory the current Jest topology (`__tests__/analytics/**/*`, slice-level specs under `__tests__/features/**`, helper utilities).
- Capture coupling between tests, infrastructure, and CI (`package.json` test scripts, env overrides, helper APIs).
- Identify blockers that prevent consolidating every suite under the feature directories today.

> **Update (2026-01-09):** The analytics suites referenced below have now been relocated under `__tests__/unit/features/analytics/**` (application + domain folders). The remainder of this review is preserved for historical context on why the move required extra coordination.

## Current Architecture Snapshot

- **Dual hierarchies**: Regression/API suites remain directly under `__tests__/` (e.g., `__tests__/analytics.test.ts` seeds users/metrics/logs through `helpers/test-utils`) while the slice-aligned suites live under `__tests__/features/<feature>/**` for unit and adapter coverage (`__tests__/features/analytics/application/GetDashboardVisualization.test.ts`, `__tests__/features/analytics/infrastructure/persistence/VisualizationReadRepoSequelize.test.ts`). The split is intentional but undocumented outside the migration notes.
- **Legacy contracts baked into docs/CI**: Phase 4’s regression log still lists `__tests__/analytics/**/*.test.ts` as the canonical analytics suite, and the migration plan reiterates that automated tests “align with the old structure.” Relocating files without first updating those documents would break the audit trail and confuse QA.
- **Environment-sensitive runner**: `npm run test:dev` injects `DB_HOST=127.0.0.1 REDIS_REQUIRED=false NODE_ENV=test` before calling Jest, but other scripts (`npm run jest -- --runTestsByPath …`) do not. Every integration suite—including analytics dashboard specs that spy on `sequelize.query`—assumes that environment shim is present. The dependency is captured in the plan/test logs but not inside the tests themselves.
- **Helper surface area**: Cross-feature helpers live under `__tests__/integration/helpers/test-utils.ts`, so API suites outside of analytics still instantiate auth tokens, metrics, and logs the same way. That reduces duplication but pins all suites to shared helper behavior (e.g., fixture lifecycles, built-in truncation).

## Findings

1. **Consolidation blockers** – Moving `__tests__/analytics/**/*` under the feature hierarchy requires simultaneous updates to documentation, CI scripts, and helper imports. Until those contracts are rewritten, the existing location is still the “documented truth,” creating friction whenever contributors expect everything under `__tests__/features/…`.
2. **Fragile environment coupling** – Because the regression suites depend on `test:dev`’s env overrides, contributors who scope tests via `npm run jest -- --runTestsByPath` risk failing with `SequelizeHostNotFoundError`. The migration plan mentions this pitfall, but there is no automated guard or npm alias to enforce the safe path.
3. **Limited observability of flaky analytics specs** – The dashboard service tests stub `sequelize.query` directly, forcing `jest.setup.ts` to handle mocked responses defensively. Failing to maintain that guard (noted in Phase 4 progress) would break unrelated suites since table truncation also relies on `sequelize.query`.
4. **JWT coverage gaps** – Auth/JWT logic is tested indirectly through API suites, but there are no targeted tests asserting the issuer/audience/rotation policy described in the JWT overhaul documents. As we tighten JWT handling, we need explicit slice-level unit and integration coverage to keep regression suites lean.

## Recommendations

1. **Publish a migration note** explaining why `__tests__/analytics/**/*` still exists and outline the checklist required before relocating (update docs, CI globs, helper imports). This review captures the rationale and should be linked from future PRs touching analytics tests.
2. **Introduce npm aliases** (e.g., `npm run test:scope -- <path>`) that automatically export the same env overrides as `test:dev`. This lowers the barrier for contributors who need to run a single suite locally.
3. **Add health checks in `jest.setup.ts`** ensuring the mocked `sequelize.query` fallback cannot regress silently. Logging a warning when analytics suites register spies would help us detect future refactors that forget to reset the spy.
4. **Fold JWT-specific assertions into the analytics/auth regression layer** once the overhaul lands: use `__tests__/features/auth/**` to verify signing/verification semantics while keeping API suites focused on HTTP wiring.
5. **Plan the final consolidation** as a tracked task: after the docs/CI references move to the feature glob, relocate the remaining legacy suites under `__tests__/features/analytics/**` and delete the top-level folder to remove ambiguity.
