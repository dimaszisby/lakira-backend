# Relative ranges and lifecycle timestamps — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Cut from `origin/dev` at
`04999d0` (#162). Paths without a root are under `src/features/public/analytics/`.

## Phase 0 — kit and branch

- [x] `fix/analytics-relative-range` cut with `--no-track` from `origin/dev` at `04999d0`; HEAD
      and upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01 to D-04, written before any code

## Phase 1 — the range

- [x] A test against the database of D-03's reading: a fallback ending 1 ms after a log made in
      the first second of a day
- [x] `domain/relative-range.ts` — `startOfNextBucket` and `resolveRelativeRange`, pure, the clock
      passed in
- [x] `__tests__/unit/features/analytics/domain/relative-range.test.ts`
- [x] `infrastructure/http/schema.zod.ts` — `resolveRange` takes `tz` and calls
      `resolveRelativeRange`; `anchorNow`, `BUCKET_ANCHOR_MS` and `computeStartEndFromLast` are gone

## Phase 2 — the timestamps and the fallback

- [x] `infrastructure/sql/visualization.dashboard.sql.ts` — `MIN(logged_at)`, `MAX(logged_at)`
- [x] `domain/fallback-range.ts` — `tz` in `FallbackInput`; the end from `startOfNextBucket`
- [x] `infrastructure/persistence/VisualizationReadRepoSequelize.ts` — passes `tz`
- [x] Tests: `fallback-range.test.ts`, `VisualizationReadRepoSequelize.integration.test.ts`,
      `analytics.test.ts`, `analytics-caching.test.ts`

## Phase 3 — the spec and documents, after review

- [x] `src/lib/openapi/openapi-schemas.ts` — the description of `last`; the spec regenerated
- [x] ADR-0062, its registry row, the count in `CLAUDE.md`; D-01 becomes a pointer
- [x] `docs/explanation/product-requirements.md` — the analytics row
- [x] Register: B-02 and B-49 to Closed, naming this branch; O-01 removed; the todo marked Fixed;
      a row for what planning found and this PR leaves
- [x] Loose ends from #162: the PR number on Closed rows B-07 and B-17; the
      `jwt-secret-minimum-length` README status line; the register's "As of" line

## Discovered

- [x] Found: D-03's reading holds. A range ending 1 ms after a log made at 00:00:00.500 returned
      `count: 0`; ending at the next midnight returned 1 → in scope, D-03 stands
- [x] Found in review: the first wall-time conversion took the second of two instants east of
      UTC (Berlin, 02:00 on 2025-10-26) → in scope, fixed, with a test either side of UTC
- [x] Found in review: a window too long for a `Date` threw instead of being refused → in scope,
      it now gives an empty range, which is refused as invalid
- [x] Found: the driver returns a `timestamptz` as a `Date`; the two timestamps are now turned
      into ISO strings in the repository, as the response type says → in scope
- [x] Found: the dashboard item's `firstLogAt`, `lastLogAt`, `totalLogs`, `latestValue`,
      `latestBucketStart`, `requestedRange`, `actualRange`, `fallbackRangeUsed` and
      `fallbackStrategy` are returned and are not in the spec's item schema
      (`src/lib/openapi/openapi-schemas.ts`, `DashboardVisualizationItemSchema`) → out of scope,
      register row B-65
- [x] Found: a fallback computes a coarser bucket and reports it in `actualRange.bucket`, and
      `fetchFallbackSeries` queries with the requested one → out of scope, register row B-65
- [x] Found: `bucket_start` is a timestamp without zone, which the driver reads in the server
      process's zone. With the process in `Asia/Jakarta`, the bucket for 2025-06-10 in `tz=UTC`
      came back as `2025-06-09T17:00:00.000Z`. Correct only where the process runs in UTC → out
      of scope, register row B-65

## Review

Run on Node 24.21.0 at `04999d0` plus this change.

- typecheck, lint, format, build: pass.
- tests: unit 1063 passed (1028 before, 35 new), also with `TZ=America/New_York` and
  `TZ=Asia/Jakarta`; integration 237 passed, 5 skipped (230 before, 7 new).
- OpenAPI: the regenerated spec validates (47 operations) and differs from the committed one
  only in the description of `last`, on both routes.
- security delta: skipped, no dependency changed. image smoke: skipped, nothing the image holds
  or how it starts changed.
- The six new integration cases that touch behaviour fail on the source at `04999d0` and pass on
  this branch.
- Not done: the checks against the dev server named in the plan. The HTTP integration cases make
  the same requests against the test database, so the owner's development data was left alone.
- Not checked: whether any frontend code minds `meta.range.endISO` lying in the future.

## Acceptance

- [x] **AC-1** — `last=7d&bucket=1d` covers a log made in the current local day, for `tz=UTC` and
      `tz=Asia/Jakarta`, with the clock set either side of 00:00 UTC. _Why:_ the frontend's report.
- [x] **AC-2** — Two requests inside one bucket compute the same range, and the second answers 304. _Why:_ what the rounding was for.
- [x] **AC-3** — `firstLogAt` and `lastLogAt` equal the stored `logged_at` of the first and last
      log, whatever `tz` is sent. _Why:_ a `Z` suffix has to mean UTC.
- [x] **AC-4** — A metric whose only log is its newest returns that log through the fallback
      range, with `tz=UTC`, including a log made in the first second of a bucket. _Why:_ the case
      of 2026-10-08, and D-03.
- [x] **AC-5** — The spec's description of `last` says the range runs through the end of the
      current bucket in the requested zone. _Why:_ the next reader should not have to ask.
- [x] **AC-6** — The dashboard's stats and series agree with the single-metric route for the same
      relative range. _Why:_ #145 fixed a disagreement here.
- [x] **AC-7** — A daily range across a daylight-saving change in `America/New_York` starts and
      ends on local midnights, and an hourly range in `Asia/Kolkata` ends on a local hour. _Why:_
      D-01 claims one rule for every zone.
- [x] **AC-8** — Two logs sharing a local time inside a repeated daylight-saving hour:
      `lastLogAt` is the later instant. _Why:_ B-49.

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests
- [x] build
- [x] OpenAPI — a parameter's description changes
- [ ] security delta — skipped: no dependency changes (D-04)
