# Analytics Frontend Overhaul Plan

## 1. Purpose & Scope

This plan translates the backend roadmap in `analytics-backend-overhaul-plan.md` and the UX findings from `visualization-frontend-analysis.md` into concrete frontend deliverables. The objective is to ensure the dashboard UI can consume the richer `/analytics/dashboard` payload, surface context-aware empty states, and expose in-place recovery controls without regressions elsewhere.

## 2. Alignment Summary

- Backend will enrich each `DashboardVizItem` with lifecycle metadata (`lastLogAt`, `firstLogAt`, `totalLogs`, `latestValue`, `requestedRange`, `actualRange`, `fallbackRangeUsed`, optional `fallbackStrategy`) and expose additional `meta` fields (`totalMetrics`, `fallbackMetrics`, `sync.etagSeed`).
- Frontend must update types/api hooks, handle version negotiation (temporary `?v=2` query param), and redesign the dashboard card UX to leverage the new data.
- Success criteria: dashboards show differentiated empty states (never logged vs. no data in range vs. auto-fallback), provide inline filter controls, and respect new caching semantics.

## 3. Dependencies

1. Backend contract v2 available in staging with sample payloads.
2. Updated OpenAPI definition or typed response schema for `/analytics/dashboard` v2.
3. Product/Design approval for new dashboard controls and empty-state copy.
4. QA fixtures representing metrics across the lifecycle spectrum.

## 4. Frontend Workstreams

### 4.1 Data Contract & Infrastructure

- **Types & API layer**
  - Update `DashboardVizItem` in `src/features/data-visualizations/types.ts` to include new fields with accurate nullability.
  - Extend `DashboardVizResponse.meta` with `totalMetrics`, `fallbackMetrics`, and optional `sync` structure.
  - Modify `getDashboardVisualizations` to request the new contract (`?v=2`), parse response, and surface `etagSeed` (if provided) as part of cache key to force invalidation when metadata changes.
  - Enhance `useDashboardVisualizations` query key to include version + fallback indicator to prevent stale merges.
- **Caching**
  - Update `etagCache` to incorporate the backend-provided `sync.etagSeed` when storing payloads. If `etagSeed` changes between requests, bypass local cache even when HTTP status is `304`.

### 4.2 State & Filters

- **UI Controls**
  - Introduce a dashboard filter toolbar (bucket select + range presets + absolute picker). Hook controls into `useDashboardFilters` so URL remains source-of-truth.
  - Add quick-action chips per card (e.g., "Show last 90d", "Use last activity"), calling `setRange`/`setBucket` from the hook.
- **Preset Logic**
  - Define recommended presets (e.g., 7d/30d/90d/365d, plus `last activity`). Ensure they respect backend bucket guard (<=400 buckets).
  - When backend indicates `fallbackRangeUsed`, highlight the preset corresponding to the actual range but retain the requested filters in the toolbar.

### 4.3 Card UX & Empty States

- **Card Layout**
  - Update `MetricCardFromBatch` to show: category chip, metric name, `lastLogAt` badge ("Updated 12 Jan"), optional `fallback` pill when backend auto-expanded.
  - Display `actualRange` vs. `requestedRange` in tooltip or inline text when they differ.
- **Empty-State Variants**
  - `neverLogged`: `totalLogs === 0` ⇒ show onboarding copy + CTA “Add first log”.
  - `noDataInRange`: `totalLogs > 0` and `series` empty while `fallbackRangeUsed=false` ⇒ show copy “No logs between {range}” + CTA to broaden range.
  - `fallbackView`: `fallbackRangeUsed=true` ⇒ show chart using fallback data plus label “Showing last active period ({actualRange})”. Provide CTA to adopt fallback as new filter settings.
  - Provide tertiary actions: `Add log`, `View metric`, `Adjust filters`.
- **Stats Section**
  - Use `latestValue` as default tooltip when `series` empty so the card still shows the most recent measurement.
  - Replace `n` stat with `totalLogs` when outside range to better reflect metric usage.

### 4.4 Global Messaging & Pagination

- **Meta Banner**
  - If `meta.totalMetrics > items.length`, display message “Only first {limit} of {totalMetrics} metrics shown” with CTA linking to metric settings.
  - If `meta.fallbackMetrics > 0`, show dismissible banner explaining fallback behavior.
- **Page-Level Empty State**
  - Distinguish between “no metrics configured” vs. “all metrics exist but no data in current range.” Use `totalMetrics` to decide which message to show.

### 4.5 Observability & QA Hooks

- Log React Query events when fallback cards render to capture adoption.
- Add data-testid attributes for each empty-state variant to simplify automated tests.

## 5. Implementation Phases & Tasks

| Phase                        | Timeline  | Key Tasks                                                                                                                                                | Owners       |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **P0 – API contract prep**   | Week 0    | Pair with backend to review sample payload, finalize TS interfaces, gate new behavior behind `FEATURE_DASHBOARD_V2`.                                     | FE Tech Lead |
| **P1 – Data plumbing**       | Week 1    | Update types, API hooks, query keys, and etag cache; add integration tests hitting mocked responses; toggle request to `/analytics/dashboard?v=2`.       | FE Core      |
| **P2 – Filter toolbar**      | Weeks 1-2 | Build UI components, hook into `useDashboardFilters`, ensure SSR compatibility, add RTL tests.                                                           | FE UI Squad  |
| **P3 – Card UX**             | Weeks 2-3 | Implement `MetricCard` variants, integrate metadata fields, update `MetricChart` to display fallback annotation, write storybook stories for each state. | FE UI Squad  |
| **P4 – Banners & Messaging** | Week 3    | Implement page-level banners for `totalMetrics` and `fallbackMetrics`, refine empty-state copy with Product.                                             | FE + Content |
| **P5 – QA & Rollout**        | Weeks 4-5 | E2E tests (Playwright) covering filter adjustments, fallback acceptance, caching invalidation; monitor metrics post-launch; remove feature flag.         | QA + FE      |

## 6. Testing Strategy

- **Unit tests** for new helpers (range preset logic, fallback CTA prompts, etagSeed handling).
- **Component tests** using React Testing Library for each card state + filter toolbar interactions.
- **Storybook visual regression tests** for new UI states.
- **Playwright E2E** to validate end-to-end flows: adjusting filters, applying fallback suggestions, verifying metadata updates after editing metric settings.

## 7. Risks & Mitigations

| Risk                                           | Mitigation                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Backend fields land after FE code              | Keep feature flag and mock payloads locally; degrade gracefully when fields missing.                                              |
| Range presets conflict with backend guardrails | Centralize bucket/range validation helper shared with backend constants; clamp ranges before sending queries.                     |
| Stale caches despite etagSeed                  | Log warnings when `sync.etagSeed` changes while HTTP 304 observed; fallback to forcing refetch (`queryClient.invalidateQueries`). |
| UX overwhelm from added controls               | Iterate with design; use progressive disclosure (collapsed filter toolbar on small screens).                                      |

## 8. Deliverables

1. Updated TypeScript interfaces and API client with version negotiation.
2. Dashboard filter toolbar + contextual CTA components.
3. Metric card redesign supporting three empty-state variants and fallback annotation.
4. Telemetry emitting frontend fallback usage.
5. QA scripts + Playwright specs covering new flows.

## 9. Next Actions

1. Request backend sample payload + OpenAPI diff; confirm final field names.
2. Kick off design sync for filter toolbar + banners.
3. Set up feature flag scaffolding and mock data scenarios to unblock UI work before backend readiness.
