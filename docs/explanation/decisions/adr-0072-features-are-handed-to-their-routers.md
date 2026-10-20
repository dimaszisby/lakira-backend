# ADR-0072 — Features are handed to their routers

- **Status:** Accepted (merged in #192, `394f949`)
- **Date:** 2026-10-20
- **Related:** Takes up the option [ADR-0045](./adr-0045-feature-modules-construct-nothing-on-import.md)
  deferred, and keeps its rule (importing a feature module constructs nothing);
  [ADR-0056](./adr-0056-one-wiring-per-feature-for-every-entry-point.md) (one wiring per feature)
- **Origin:** `D-01` to `D-05` in the inject-features-into-routers kit —
  [`inject-features-into-routers`](../../internal/initiatives/inject-features-into-routers/decisions.md);
  register rows B-32, B-31 and B-34

---

## Context

ADR-0045 stopped feature modules constructing anything on import by giving each controller a
module-level slot, filled on first use (`feature ??= buildXFeature()`), and swapped by an
`override*FeatureForTest` hook. It named injecting the feature into the router factory as the
cleaner shape, and deferred it.

The slots outlived their reason. Seven controllers held eight of them, and eleven hooks swapped
them. `src/server.ts` did production wiring through three hooks (`installMetricLogFeature`,
`installAuthFeature`, `installOrgFeature`), so an entry point that forgot one ran an unwired
feature without a sign: metric-log without its visualization invalidator, auth without the
server's publisher (the 2026-10-03 audit's S15). Twelve test files swapped a feature on the app
every test shares, and a test that failed between its swap and its reset left its feature for the
next file. The metric controller built the analytics feature for the trends endpoint, the one
sibling composition-root import, exempted by name in `eslint.config.mjs`.

## Decision

1. **`createApp(features)` assembles the app** (`src/app.ts`): the global pipeline, the probes,
   every router, the docs, the 404 and the error handler. Nothing in it listens or connects.
2. **`buildWiredFeatures({ messageQueue })` builds every feature once**
   (`src/composition/features.ts`), through a feature's own composition root where it has one.
   One auth instance serves the auth, organization, invite and membership routers. `src/server.ts`
   calls it once and hands the result to `createApp`.
3. **A router takes its feature, and a controller is a factory.** `createXRouter(feature)` builds
   `createXController(feature)`, whose handlers close over it. The parameter is required: there
   is no default, so no fallback can build an unwired feature.
4. **Trends through a query, not a feature.** The metric router takes
   `{ metric, metricTrend }`, where `metricTrend` is analytics' `getMetricTrend`, typed through
   analytics' `public.ts`. The ESLint exemption is deleted.
5. **A test that needs another feature builds its own app.** `appWith({ ... })`
   (`__tests__/integration/helpers/app-with.ts`) is `createApp` over the server's features with
   some replaced; a unit test calls the controller factory with a stub.

## Options considered

- _Keep the slots and route production wiring through `createApp`._ Removes the install hooks but
  keeps the module state, and the tests still mutate a shared app.
- _Move the trends endpoint into analytics._ The todo's other option. A route-ownership change,
  with the OpenAPI tags and the contract gate to recheck; a query handed to the metric router
  needs neither.
- _A registry object every router reads from at request time._ Injection in name only: a getter
  over module state.

## Consequences

- Features are built when `src/server.ts` is imported, as auth and metric-log already were.
  Repositories open no connection; ADR-0045's rule is about feature modules, not the entry point.
- A test cannot change what another test sees. The integration suite ran 117 s against 130 s
  before the change, so an app per test costs nothing measurable.
- `authMiddleware` keeps its own lazy default instance. Routers and tests refer to it by identity,
  and it is middleware, not a feature behind a router. It is the one slot left.
- A new feature is added to `AppFeatures` and `buildWiredFeatures`, and mounted in `createApp`.

## Enforcement

`__tests__/unit/architecture.test.ts`, "features are handed to their routers": no file under
`src/` exports a `*ForTest` or `install*Feature` hook; no controller keeps a module-level feature
slot or builds a feature; `server.ts` builds the features once and hands them to `createApp`; the
four auth routers receive `features.auth`. On the code before the change each of the first three
found 7 files. A router called without its feature does not compile.

## Links

- Kit: [`inject-features-into-routers`](../../internal/initiatives/inject-features-into-routers/README.md)
- Todos: `docs/internal/todos/2026-09-24-todo-inject-features-into-router-factories.md`,
  `docs/internal/todos/2026-09-24-todo-metric-trends-uses-analytics-composition-root.md`
