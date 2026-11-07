# Inject features into routers — Checklist

## Phase 0 — kit and branch

- [x] `refactor/inject-features-into-routers` cut with `--no-track` from `origin/dev` at
      `cb25531`; HEAD and upstream verified
- [x] `README.md`, the plan, this file, `decisions.md`

## Phase 1 — the app factory and the composition root

- [x] `src/app.ts` — `createApp(features)`: what `server.ts` did from `express()` through
      `errorHandler`; the OpenAPI document built on the first call and shared
- [x] `src/composition/features.ts` — `AppFeatures`, `buildWiredFeatures({ messageQueue })`
- [x] `src/server.ts` — `const features = buildWiredFeatures({ messageQueue })`,
      `createApp(features)`; process concerns only
- [x] each `feature.ts` — `export type XFeature = ReturnType<typeof buildXFeature>`

## Phase 2 — one feature at a time

- [x] metric-category: `createMetricCategoryController`, `createMetricCategoryRouter(feature)`;
      `metric-category-list-cache.test.ts` on `appWith`
- [x] metric-settings, metric-log, auth, organization: controller factories and router parameters
- [x] metric: `createMetricController({ metric, metricTrend })`; analytics' `public.ts` exports the
      `GetMetricTrend` type
- [x] analytics: `createAnalyticsController`, `createVisualizationRouter(feature)`
- [x] `__tests__/integration/helpers/app-with.ts`; `createTestUser(overrides, agent)`

## Phase 3 — hooks, slots, exemption, rules

- [x] every slot and hook removed; `server.ts` calls none
- [x] `eslint.config.mjs` — the trends exemption deleted
- [x] `architecture.test.ts` — five new rules; three moved from `server.ts` to `app.ts` and
      `composition/features.ts`

## Phase 4 — docs

- [x] ADR-0072 (Proposed), its registry row; a dated note on ADR-0045; `CLAUDE.md` counts 72
- [x] `.claude/rules/architecture.md`, `.claude/skills/new-feature/SKILL.md`,
      `docs/explanation/architecture/feature-slice-ddd.md` (D5),
      `docs/tutorials/your-first-feature-slice.md`
- [x] both todos closed; register rows B-31, B-32 and B-34 to Closed; #191's loose ends

## Discovered

- [x] Found: a first pass at removing the slots also removed the auth controllers' helpers that sat
      between the hooks and the first handler (the refresh cookie, the validators, two messages)
      → in scope, restored from `HEAD`; the diff of both files against `HEAD` is the slot only
- [x] Found: `createTestUser` registered through the shared app, so in the two auth API tests the
      registration email no longer reached the test's sender → in scope, it takes an optional app
- [x] Found: `metric-category-list-cache.test.ts` relied on a create through the shared app
      invalidating the swapped feature's cache → in scope, that create goes through the test's app
- [x] Found: `prettier --write src` reformatted 16 migrations, against the standing rule to format
      named files only → restored with `git checkout -- src/migrations`; no migration differs from
      `HEAD`

## Acceptance

- [x] AC-1 — `architecture.test.ts` › "features are handed to their routers": no hook, no slot,
      no controller building a feature. Run against `HEAD`'s files, each finds 7
- [x] AC-2 — › "server.ts builds the features once and hands them to createApp", "one auth feature
      serves the auth, organization, invite and membership routers"
- [x] AC-3 — the metric controller imports `GetMetricTrend` from analytics' `public.ts`; lint
      passes with the exemption deleted; the trends tests pass unchanged
- [x] AC-4 — typecheck failed on `app.ts`'s six unconverted router calls once the routers took
      their feature, before they were handed one
- [x] AC-5 — moved to `appWith`: `metric-category-list-cache`, `auth-password-reset`,
      `auth-verify`, `organization-membership`, and the four queue tests (invite, password reset,
      verification, dummy metric logs); unit tests on the controller factories: auth, metric,
      metric-log, metric-settings; router tests mock the factories: analytics, auth, metric,
      metric-log, metric-settings
- [x] AC-6 — `docs:openapi:check` passes with no diff; contract quick profile 36 passed, 6 skipped,
      the same two warnings

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — `test:coverage`: unit 1363 passed; integration 273 passed, 5 skipped; thresholds met
- [x] build
- [x] OpenAPI — no drift
- [x] image smoke — passed
- [ ] security delta — skipped: no dependency changes
