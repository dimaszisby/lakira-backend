# Todo — the metric controller builds the analytics feature for the trends endpoint

- **Status:** Open
- **Created:** 2026-09-24
- **Owner:** unassigned
- **Origin:** `routers-at-module-scope` kit, [D-04](../initiatives/routers-at-module-scope/decisions.md)

---

## What

`src/features/public/metric/infrastructure/http/controller.ts` imports `buildAnalyticsFeature` from
`@/features/analytics/feature.js`, another feature's composition root, to serve
`GET /api/v1/metrics/:metricId/trends` (the `overrideMetricTrendFeatureForTest` hook).

ADR-0045 made "no sibling imports another feature's `index.ts` or `feature.ts`" an ESLint rule.
This is the only existing crossing, and it is exempted by name in `eslint.config.mjs`.

## Options

- **Move the endpoint into analytics.** Analytics would own `/metrics/:metricId/trends`, mounted
  from its own router. This is a route-ownership change, so check the OpenAPI tags and the
  contract gate afterwards.
- **Expose a trends query through analytics' `public.ts`**, as a port the metric controller calls,
  with no composition root crossing.

Either one lets the exemption block in `eslint.config.mjs` be deleted.
