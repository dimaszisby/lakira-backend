# Metric-log stats in SQL — Checklist

Checked against `origin/dev` at `66eaf20` (#201).

## Phase 0 — kit and branch

- [x] `fix/metric-log-stats-in-sql` cut with `--no-track` from `origin/dev` at `66eaf20`; HEAD and
      upstream verified
- [x] This kit: README, plan, this file, `decisions.md` with D-01 to D-03
- [x] Register D-09: the stats key of X11/X21 folded in

## Phase 1 — tests first, each seen to fail

- [x] `__tests__/integration/api/metric-log-stats.test.ts`, five tests (AC-1 to AC-5). On the
      unchanged code: 200,000 logs answered 500 from the `RangeError`; the range was ignored; a
      zone-less datetime and an inverted range answered 200. The scoping test (AC-4) passed, as a
      guard should. The cache test could not compile (no `metricLogStatsCacheKey`); with the
      fix, it failed when the invalidation was mutated back to exact keys, and passed restored
- [x] Unit: `MetricLogStatsRepoSequelize.test.ts` rewritten for one aggregate row;
      `cache-keys.test.ts` gains `metricLogStatsCacheKey`; `router.test.ts` and
      `MetricLogCacheRedis.test.ts` take the new key and patterns. Three suites failed to compile
      and two invalidation tests failed on the unchanged code

## Phase 2 — the fix

- [x] `MetricLogStatsRepoSequelize.ts` one `findOne` of `AVG`/`MIN`/`MAX`/`COUNT` (D-01);
      `MetricLogStatsPort.ts` and `GetMetricLogStats.ts` take `from` and `to`; `controller.ts`
      passes them
- [x] `schema.zod.ts`: `zISODateTime` bounds and the end-after-start refinement (D-02)
- [x] `cache-keys.ts` `metricLogStatsCacheKey`; `router.ts` uses it; `MetricLogCacheRedis.ts`
      deletes by pattern (D-03)
- [x] `openapi-schemas.ts` `MetricLogStatsQuerySchema`; `openapi-docs.ts` uses it and describes
      the range; `docs/reference/api/lakira-backend-openapi.json` regenerated (23 lines added)

## Phase 3 — gates, review, docs

- [x] Statement log of the throwaway Postgres: one aggregate statement per request, with the old
      scoping (the join keeps `deleted_at IS NULL`). `EXPLAIN ANALYZE` over 200,000 logs: 27 ms by
      a scan of the metric's rows (they are every row of the table); with a one-hour range, the
      BRIN index on `logged_at`
- [x] Review of the diff: no defect. Probed: `z.string().datetime()` refuses
      `2025-02-30T00:00:00Z`, `2025-13-01…` and hour 25, so no `NaN` reaches the query or the key
- [x] ADR-0079; ADR README row and next number; CLAUDE.md count 79
- [x] Register: B-79 to Closed; B-82 keeps two raw-query keys; D-09; B-85 and its todo for CI
      wall-clock time; "As of" `66eaf20`; the B-79 todo closed
- [x] #201's loose ends: register D-08 Accepted; B-80's Closed row and its todo name
      `#201 (66eaf20)`; `inner-layers-reach-infrastructure` README Done

## Discovered

- [x] Found: `cacheMiddleware` is off under `NODE_ENV=test`, so an HTTP test cannot see the cache
      → in scope, the cache test drives the real key builder and invalidation against a live Redis,
      behind `ENABLE_REDIS_INTEGRATION`, as `VisualizationCacheRedis`'s test does. CI does not set
      it, so CI skips that one test; it ran here
- [x] Found: a colleague's metric answers 403, not 404 → in scope, the test was wrong and now
      states the existing behaviour
- [x] Found: one `socket hang up` in `analytics-caching.test.ts` on one full run, not reproduced in
      three runs of the suite or the next full run → recorded on B-11's todo, not fixed here
- [x] Found: no Notion record is owed. The frontend never calls this endpoint (frontend
      `origin/dev` at `7fc20e5`; only its generated types name it)

## Acceptance

- [x] AC-1 — › answers 200 with exact stats over 200,000 logs
- [x] AC-2 — › counts logs from startDate, inclusive, to endDate, exclusive
- [x] AC-3 — › refuses a range that ends before it starts, and a datetime with no offset
- [x] AC-4 — › counts only the caller's own logs, with and without metricId
- [x] AC-5 — › with the Redis cache › clears every cached range of the metric and of all, and
      nothing else; `cache-keys.test.ts` › metricLogStatsCacheKey
- [x] AC-6 — the regenerated spec: `startDate` and `endDate` documented, the response schema
      unchanged

## Gates

Node 24.22.0 (official tarball, checksum verified); throwaway `postgres:18` and `redis:7-alpine`
on 55432 and 56379, with `TEST_DATABASE_URL`, `DATABASE_URL` and `REDIS_URL` pinned to them.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 147 suites, 1503 tests passed, thresholds met;
      `test:integration:coverage` 41 suites passed (2 skipped), 290 tests passed (6 skipped),
      thresholds met, on the second run (the first had the one `socket hang up` above)
- [x] build — clean
- [x] OpenAPI — the regenerated spec validates (47 operations, 399 `$ref`s) and a second
      generation is byte-identical. `docs:openapi:check` itself exits 1 until the spec is
      committed, because it diffs against the committed file; CI runs it on the commit
- [ ] security delta — skipped: no dependency added, upgraded or removed
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
