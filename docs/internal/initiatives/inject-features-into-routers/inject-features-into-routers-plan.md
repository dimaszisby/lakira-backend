# Inject features into routers — Plan

- **Status:** Done
- **Appetite:** 2 days
- **Date:** 2026-10-20

## Context and goals

Three register rows on one theme:

- **B-32** — routers reach their feature through module-level slots in their controllers, filled on
  first use and swapped by `install*Feature` and `override*FeatureForTest` hooks; `src/server.ts`
  wires production through three of them; tests swap features on the shared app (todo
  `2026-09-24-todo-inject-features-into-router-factories.md`, the option ADR-0045 deferred).
- **B-31** — the metric controller builds the analytics feature for the trends endpoint, the one
  sibling composition-root import, exempted by name in `eslint.config.mjs`.
- **B-34** — a controller's fallback builds an unwired feature (2026-10-03 audit, S15).

When this lands, `server.ts` builds each feature once and hands it to its router, controllers are
closures over what they are given, and a test that needs a different feature builds its own app.

## Acceptance criteria

- **AC-1** — No file under `src/` exports a `*ForTest` or `install*Feature` hook, and no controller
  keeps a module-level feature slot; `architecture.test.ts` fails on either.
  _Why:_ B-32; a rule, so the pattern cannot return unnoticed.
- **AC-2** — `server.ts` builds the features once through `buildWiredFeatures` and hands them to
  `createApp`; the auth and organization routers receive the same auth instance.
  _Why:_ production wiring through the front door, as ADR-0056 asks of every entry point.
- **AC-3** — The metric feature imports nothing from analytics but its `public.ts`; the ESLint
  exemption is gone; the trends endpoint's tests pass unchanged.
  _Why:_ B-31.
- **AC-4** — Every `createXRouter` and `createXController` requires its feature: called without
  one, it does not compile.
  _Why:_ B-34; no fallback can build an unwired feature.
- **AC-5** — Every existing test passes; the files that swapped a feature build their own app, and
  no test changes state another can see.
  _Why:_ a refactor must not lose a case; shared mutable state leaked between files.
- **AC-6** — No route, status, body or OpenAPI change; the spec regenerates with no diff and the
  contract quick profile passes as before.
  _Why:_ this is a refactor.

## Open questions

None.

## Out of scope

`authMiddleware`'s own lazy default; moving the trends route into analytics; the worker's wiring;
any behaviour change.

## Decisions expected

The app factory (D-01); the composition root (D-02); controllers as factories (D-03); trends
through a query (D-04); tests building their own app (D-05).

## Phases

### Phase 0 — kit and branch

### Phase 1 — `createApp` and `buildWiredFeatures`

### Phase 2 — one feature at a time

metric-category first, then metric-settings, metric-log, auth with the organization routers,
metric with trends, analytics; each with its tests.

### Phase 3 — remove the hooks, slots and exemption; add the rules

### Phase 4 — gates, review, docs

## Risks and trade-offs

Features are built at import of `server.ts`, as auth and metric-log already were. An app per test
could slow the integration suite; measured, it did not (117 s against 130 s before).

## Rollback

Code: revert the PR. No migration, no runtime behaviour change.

## References

- ADR-0072; ADR-0045; ADR-0056
