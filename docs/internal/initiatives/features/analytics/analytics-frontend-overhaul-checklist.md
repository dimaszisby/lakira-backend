# Analytics Frontend Overhaul Checklist

This checklist translates the plan into actionable development steps. Check items sequentially per phase; track blockers in project board.

## 1. Foundations & Contract Readiness

- [ ] Confirm `/analytics/dashboard?v=2` payload structure with backend (sample response + OpenAPI diff).
- [ ] Set up feature flag (e.g., `FEATURE_DASHBOARD_V2`) and mock payload fixtures for local development.
- [ ] Update TypeScript types (`DashboardVizItem`, response `meta`, `sync` shape) reflecting new backend fields.
- [ ] Adjust API client (`getDashboardVisualizations`) to append `?v=2`, parse new fields, and include `etagSeed` in cache keying.
- [ ] Extend `etagCache` to respect backend-provided `etagSeed` (invalidate when seed changes, even on HTTP 304).

## 2. Filter & State Enhancements

- [ ] Design-approved filter toolbar (bucket selector, relative presets, absolute date picker) finalized.
- [ ] Implement filter toolbar component wired to `useDashboardFilters`, ensuring URL sync & SSR compatibility.
- [ ] Add quick-action chips per card (e.g., "Show last 90d", "Show last activity") invoking filter updates.
- [ ] Validate guardrails: ensure preset ranges never exceed 400 buckets or adjust bucket granularity automatically.

## 3. Card Experience

- [ ] Update `MetricCardFromBatch` to display new metadata (`lastLogAt`, `actualRange`, fallback badges, etc.).
- [ ] Implement three empty-state variants: `neverLogged`, `noDataInRange`, `fallbackView`, each with contextual copy/CTAs.
- [ ] Ensure `MetricChart` can annotate fallback mode (e.g., overlay label) and gracefully render when series empty but `latestValue` exists.
- [ ] Add CTA buttons (`Add log`, `Adjust filters`, `View metric`) with correct routing and analytics hooks.
- [ ] Surface `totalLogs`/`latestValue` in stats footer, replacing ambiguous `n` when appropriate.

## 4. Global Messaging & Pagination

- [ ] Display banner when `meta.totalMetrics > items.length`, guiding users to metric settings or filters.
- [ ] Show fallback-info banner when `meta.fallbackMetrics > 0` (dismissible, stored in local state).
- [ ] Update page-level empty state to distinguish "no dashboard metrics configured" vs. "no data in selected range" using `totalMetrics`.

## 5. Telemetry & QA Instrumentation

- [ ] Emit telemetry/logs when fallback cards render or user accepts fallback recommendations.
- [ ] Add `data-testid` markers for each new empty state and banner for automated tests.
- [ ] Document analytics events (schema, payload) for data team review.

## 6. Testing & Verification

- [ ] Unit tests for helpers (range presets, fallback CTA logic, etagSeed handling).
- [ ] React Testing Library specs for filter toolbar interactions and card variants.
- [ ] Storybook stories/visual regression tests covering all states.
- [ ] Playwright end-to-end tests: filter changes, fallback adoption, CTA navigation, caching refresh after metadata edits.
- [ ] Accessibility review (keyboard navigation for toolbar/CTAs, ARIA labels on charts/badges).

## 7. Rollout

- [ ] Update documentation/release notes referencing new dashboard behavior.
- [ ] Coordinate with backend for phased rollout; enable feature flag in staging, validate telemetry signals.
- [ ] Monitor dashboards post-launch (API error rate, fallback frequency, FE telemetry) and be ready to rollback flag if anomalies detected.
