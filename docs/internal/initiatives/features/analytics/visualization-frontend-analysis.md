# Dashboard Visualization UX Analysis

## 1. Purpose

This document describes the current dashboard visualization implementation, observed UX shortcomings (especially when no data exists inside the requested range), and coordinated frontend/backend recommendations for an overhaul.

## 2. Current Implementation Summary

### 2.1 Rendering pipeline

- `src/app/(app)/dashboard/page.tsx` builds the dashboard query parameters on the server, passing them to the `DashboardContent` client component via React Query dehydrated state.
- `DashboardContent` (`src/app/(app)/dashboard/_components/DashboardContent.tsx:15`) reads filters from `useDashboardFilters`, builds a `VizQuery` (default tz `Asia/Jakarta`, fill mode `none`), and calls `useDashboardVisualizations` with `limit=12` (see `DASHBOARD_VIZ_LIMIT`).
- Each `DashboardVizItem` in the API response is rendered by `MetricCardFromBatch` (`src/app/(app)/dashboard/_components/MetricCardFromBatch.tsx`). That component pipes the item into the shared `MetricChart` component alongside the bucket/tz/range metadata.

### 2.2 Filters and defaults

- `useDashboardFilters` (`src/features/data-visualizations/useDashboardFilters.ts`) keeps bucket/range in both Jotai global atoms and URL search params, so the dashboard is deep-linkable.
- Default bucket: `1d`. Default range: relative `30d` (`src/features/data-visualizations/dashboardFilters.ts`). There is no visible control on the dashboard yet; the filter values only change when the query string is updated manually or from another UI entry point.
- Range guard: backend enforces `<= 400` buckets (`assertBounds` in service snippet) and only returns metrics with `display_options.showOnDashboard = true` and `is_active`.

### 2.3 Data access and caching

- API layer (`src/features/data-visualizations/api.ts`) calls `/analytics/dashboard` with normalized params. It uses a lightweight `etagCache` to reuse payloads when the backend returns `304`.
- React Query keeps requests warm for one minute and caches for five minutes (`staleTime`/`gcTime` in `useDashboardVisualizations`).

### 2.4 Visualization behavior

- `MetricChart` (`src/features/data-visualizations/components/MetricChart.tsx`) converts each bucket to `{x, y}` pairs. Missing values (`null`) are rendered as `NaN`, which Chart.js treats as holes. When every point is missing, the component shows a simple "No data" label centered inside the chart surface.
- The card footer displays summary stats derived from the backend response. When the dataset is empty these stats display fallback glyphs ("—" for min/max/avg and `0` for `n`).

### 2.5 Backend contract (relevant fields)

- For each metric, the backend currently returns `{metricId, name, unit, category info, priority, series[], stats{avg,min,max,count}}` restricted by the requested `[startISO, endISO)` window and bucket definition.
- There is no metadata about the metric's last log date, total samples outside of the window, or whether the backend auto-adjusted the range.

## 3. Observed UX problems

1. **Blank, context-free empty state.** When a metric has no logs inside the selected window (e.g., no entries in the last 30 days), the card simply shows "No data" with little guidance. The surrounding stats line also becomes meaningless.
2. **No obvious recovery path.** Users cannot change the bucket or range from the dashboard itself, so they must guess which metric lacks data or leave the page to find logs.
3. **Missing recency cues.** There is no indication when each metric was last updated. Active metrics look the same as abandoned ones.
4. **Backend contract limits FE messaging.** Because the API only provides per-range stats, the frontend cannot tell whether the metric has _any_ history or if the account just created it. This prevents actionable empty states ("Nothing recorded yet" vs. "No logs in the last 30 days").
5. **Cache recycle hides metadata updates.** `etagCache` reuses stale payloads until the backend invalidates the ETag. When metric metadata (name, category) changes, FE manually patches the cached payload, but stats remain stale until the cache expires. The same pattern would affect any future metadata we add.

## 4. Recommended overhaul

### 4.1 Frontend UX

- **Dedicated filter surface.** Add a compact control group (bucket dropdown + range preset picker + absolute date modal). Use the existing `useDashboardFilters` commit function so URL syncing works out of the box.
- **Multi-state empty messaging.** Extend `DashboardVizItem` to include:
  - `lastLogAt` (ISO string or `null`),
  - `totalLogs` (overall count),
  - `firstLogAt` (optional),
  - `fallbackRangeUsed` (boolean, see backend section).
    With this metadata the card can differentiate between "Never logged" (prompt to add the first log), "No logs in selected window" (offer quick filters such as "Show last 180 days"), and "Auto-expanded view" (inform the user that the data is from the last active period, not the requested one).
- **Inline recovery actions.** For empty cards, show CTA buttons: "Add log" (link to `/metrics/[id]/logs/new`), "Change range" (preset chips), or "View history".
- **Highlight recency.** Display `lastLogAt` near the title or as a tooltip on the category chip, giving quick signal about metric freshness.
- **Loading/error polish.** Replace the generic `EmptyState` fallback with a split view: (a) page-level message when no metrics are configured; (b) per-card placeholders while data is streaming or when a specific metric errors out.
- **Performance guardrails.** Keep the 12-card limit but allow the FE to show a “+X more metrics hidden” hint when the backend reports more matches than the limit.

### 4.2 Backend/data-contract changes

- **Enrich `getDashboardVisualization` response.**
  - Compute `lastLogAt` and `totalLogs` per metric (could be done with a simple aggregate on `metric_logs` limited to the filtered metric IDs to avoid extra queries).
  - Include `latestValue`/`latestBucketStart` so the FE can pre-populate tooltips even when the current window is empty.
  - Add `fallbackRangeUsed` flag and the actual bounds used whenever the backend widens the window (see below).
- **Graceful auto-range.** When `rows.length === 0` for a metric, optionally trigger a secondary query using the metric's most recent log (e.g., `[lastLogAt - defaultRange, lastLogAt]`). Return both the requested range and the fallback range so the UI can annotate the card (“Showing the last active period: 12 Jan – 9 Feb”).
- **ETag invalidation policy.** Make the dashboard endpoint's ETag incorporate metric metadata versions (e.g., `md5(metric.updated_at, metric_settings.updated_at)`), ensuring FE caches refresh when categories/names change.
- **Expose pagination metadata.** Return `meta.totalMetrics` alongside `count` so FE can communicate why only some metrics appear.

### 4.3 Interaction flow

1. User lands on `/dashboard` ⇒ FE loads 30d/1d bucket view (current behavior).
2. If API indicates empty range, FE surfaces contextual CTA + last activity info.
3. User picks broader range or taps "Show last activity" chip ⇒ FE updates URL/search params using `useDashboardFilters` and React Query refetches with new params.
4. When logs exist only outside the guardrails, backend auto-switches to fallback range and sets `fallbackRangeUsed=true`, which FE highlights.
5. When the user adds a new log, backend invalidates the dashboard ETag so the FE picks up fresh data on next refetch.

## 5. Implementation Notes & Open Questions

- **Accessibility:** When introducing richer empty states, ensure CTA buttons are reachable via keyboard and chart containers include ARIA labels (MetricChart already sets `role="img"`).
- **Localization:** Any new copy should leverage the existing i18n infrastructure (if available) or be centralized for future translation.
- **Performance:** Auto-range queries must respect the 400-bucket guard by clamping fallback windows (e.g., `min(lastLogAt - 180d, guard)`). Consider per-metric fallback instead of rerunning the expensive join for every metric.
- **Testing:** Add React Testing Library coverage for the filter controls and empty-state transitions. For backend, add integration tests that assert fallback ranges and metadata fields.
- **API versioning:** If we cannot modify the existing payload immediately, ship the new fields under a versioned media type or opt-in query flag (`?v=2`).

## 6. Next Steps

1. Align with backend on contract changes (metadata fields, fallback behavior, ETag strategy).
2. Design UX mocks covering the three empty states (never logged, no recent logs, fallback view) and the filter interactions.
3. Implement filter controls + new card states behind a feature flag, wired to mocked data.
4. Integrate backend enhancements once available, remove mocks/flags, and update documentation/help center accordingly.
