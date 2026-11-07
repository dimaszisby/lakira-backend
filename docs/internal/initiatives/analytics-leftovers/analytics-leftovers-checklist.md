# Analytics leftovers — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `5b6ee96` (#216).

## Acceptance criteria

- **AC-1** — The spec's dashboard response lists every field the repository sends. _Why:_ B-65,
  item 1 (D-01).
- **AC-2** — A fallback's `actualRange.bucket` is the bucket its series was queried with, and no
  series changes. _Why:_ B-65, item 2 (D-02).
- **AC-3** — Bucket labels and `latestBucketStart` are the same in a process in `Asia/Jakarta` as
  in UTC. _Why:_ B-65, item 3 (D-03).
- **AC-4** — On a UTC process no response changes but `actualRange.bucket` where it was coarsened;
  every gate passes. _Why:_ fixes, not a new contract.

## Phase 0 — kit and branch

- [x] `fix/analytics-leftovers` cut with `--no-track` from `origin/dev` at `5b6ee96`; HEAD and
      upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-03
- [x] #216's loose ends: `node-24-runtime` D-05 Accepted; B-89's Closed row names #216; "As of"
      `5b6ee96`

## Phase 1 — tests first

All failed on `dev`, each for the reason its decision names.

- [x] `fallback-range.test.ts`: the requested bucket is kept, and the window holds at most
      guard + 1 of them (`dev` reported `1d`)
- [x] `GetDashboardVisualization.service.test.ts`: a `1h` fallback reports `1h` and its query
      truncates to the hour (`dev` reported `1d`)
- [x] `VisualizationReadRepoSequelize.integration.test.ts`: a server process in UTC, 7 hours east
      and 4 hours west label a Jakarta day `2025-06-10T00:00:00.000Z`. `dev` sent
      `2025-06-09T17:00:00.000Z` and `2025-06-10T04:00:00.000Z`, and `latestBucketStart` as a
      `Date`
- [x] `__tests__/unit/lib/openapi-dashboard-item.test.ts`: the spec's item, `meta`, `sync`, and
      the single-metric response (13 of 13 failed on `dev`)

## Phase 2 — the changes

- [x] `domain/fallback-range.ts`: D-02; the window is the same in every case, which the existing
      fallback tests, unchanged but for one bound, confirm
- [x] `visualization.sql.ts`, `visualization.dashboard.sql.ts`: D-03
- [x] `VisualizationReadRepoSequelize.ts`: row types, `latestBucketStart` through `isoFrom`
- [x] `openapi-schemas.ts`: D-01; spec regenerated (item properties: 18)

## Phase 3 — gates, review, docs

- [x] Gates, below
- [x] Review of the diff: with the server in UTC, every SQL change gives the same values, so
      `ETag`s and cached entries hold
- [x] ADR-0062: a dated status note for D-03
- [x] Register: B-65 to Closed
- [x] Notion Part 2: none (D-01)

## Discovered

- [x] Found: Jest gives a test its own `process.env`, so setting `TZ` there does not move the
      process's zone → in scope, the integration test replaces the driver's parser for
      `timestamp without time zone` with one reading at a fixed offset (D-03)
- [x] Found: the single-metric response sends `metricId` and `meta.fill`, and the spec had
      neither → in scope, documented (D-01)
- [x] Found: the generator leaves `null` out of a nullable enum's values, and an OpenAPI 3.1
      reader then refuses the null `fallbackStrategy` most items send → in scope, the enum is
      given with `null` (D-01)
- [x] Found: `fallback-range.test.ts` › "clamps the fallback window" counted buckets at the
      coarsened grain → in scope, the bound is guard + 1 at the requested one (D-02)

## Acceptance

- [x] AC-1 — `openapi-dashboard-item.test.ts`
- [x] AC-2 — `GetDashboardVisualization.service.test.ts` › "reports the bucket a fallback series
      is queried with"; `fallback-range.test.ts`
- [x] AC-3 — `VisualizationReadRepoSequelize.integration.test.ts` › "labels a bucket the same
      with the server process …"
- [x] AC-4 — every existing analytics test passes unchanged but the one bound above; the gates
      below

## Gates

Node 24.22.1; integration against throwaway Postgres 18 and Redis 7, migrated with `migrate:test`.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `format:check` clean
- [x] tests — `test:unit:coverage` 151 suites, 1555 tests passed, thresholds met; the unit suite
      also passes with `TZ=Asia/Jakarta` and `TZ=America/New_York` (1555 each);
      `test:integration:coverage` 43 suites passed (2 skipped), 306 tests passed (6 skipped),
      thresholds met
- [x] build — clean
- [x] OpenAPI — regenerating reproduces the committed spec byte for byte, and
      `docs:openapi:validate` passes (49 operations)
- [ ] contract gate — not run locally: it migrates and seeds the database in `.env.test`, the
      owner's running `postgres_db`; left to CI's `contract_local` job
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
