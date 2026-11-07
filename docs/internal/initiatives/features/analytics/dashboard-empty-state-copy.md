# Dashboard Empty-State Copy Brief

This brief documents approved copy for the three dashboard empty-state variants referenced in the frontend and backend overhaul plans. Use these strings as the canonical source when implementing UI messaging or API-driven hints.

## 1. Never Logged (`totalLogs === 0`)

- **Headline:** "You're ready for your first log"
- **Body:** "This metric hasn't recorded any data yet. Add your first entry to unlock charts and insights."
- **Primary CTA:** "Add first log" → `/metrics/{metricId}/logs/new`
- **Secondary CTA:** "View metric details" → `/metrics/{metricId}`
- **Backend note:** Include `firstLogAt = null`, `totalLogs = 0`, `lastLogAt = null` so FE can confidently trigger this copy.

## 2. No Data in Selected Range (`totalLogs > 0`, `series.length = 0`, `fallbackRangeUsed = false`)

- **Headline:** "No logs in this range"
- **Body:** "We didn't find any entries between {requestedRange.startISO} and {requestedRange.endISO}. Try expanding the range or switching buckets."
- **Primary CTA:** "Show last 90 days" → triggers FE preset (backend unaffected).
- **Secondary CTA:** "Jump to latest log" → `/metrics/{metricId}/logs`
- **Backend note:** Echo `requestedRange` verbatim and ensure `lastLogAt` is populated so FE can offer "Jump to {relative time}" copy.

## 3. Auto-Fallback View (`fallbackRangeUsed = true`)

- **Headline:** "Showing last active period"
- **Body:** "The requested window was empty, so we're displaying data from {actualRange.startISO} – {actualRange.endISO}."
- **Primary CTA:** "Use this range" → FE updates filters to `actualRange`.
- **Secondary CTA:** "Adjust filters" → opens dashboard filter toolbar.
- **Badge Copy:** "Auto-expanded"
- **Backend note:** Provide `fallbackStrategy` for analytics instrumentation and keep `actualRange.bucket` consistent with returned `series` granularity.

## 4. Global Messaging Hooks

- **Hidden metrics banner:** "Only the first {limit} of {meta.totalMetrics} metrics are shown on the dashboard."
- **Fallback banner:** "{meta.fallbackMetrics} metrics used an auto-expanded range because no recent data exists."
- **Logging:** When `fallbackRangeUsed = true`, backend should emit structured log: `{metricId, requestedRange, actualRange, fallbackStrategy}` for observability.

Copy has been reviewed with Product & Design (v1.0, Feb 2024). Update this brief if messaging changes or localization becomes available.
