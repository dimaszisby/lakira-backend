# Query values mean what they say — Checklist

## Phase 0 — kit and branch

- [x] `fix/query-values-mean-what-they-say` cut with `--no-track` from `origin/dev` at
      `fa7c497`; HEAD and upstream verified
- [x] `README.md`, the plan, this file, `decisions.md`

## Phase 1 — tests first, each seen to fail

- [x] `VisualizationReadRepoSequelize.integration.test.ts` — a zero bucket and an empty one, both
      endpoints, both fills: on the old code the dashboard gave `[null, null, 5]` with
      `fill=none` where the single endpoint gave `[0, null, 5]`
- [x] `metric-settings/…/schema.zod.test.ts` — `includeTotal`: 10 cases failed on the old schema
- [x] `shared/cache/keys.test.ts` — separator, sentinel, glob: 3 failed on the old builder
- [x] `metric-log/…/cache-keys.test.ts` — failed: the module did not exist
- [x] `MetricLogCacheRedis.test.ts` — invalidation by the log's pattern: failed
- [x] `metric-log/…/single-log-cache.test.ts` — with the old key restored for one run, a 200 was
      replayed where a 404 was due

## Phase 2 — the fixes

- [x] B-43: `bucketValue` in `VisualizationReadRepoSequelize.ts`, used by both endpoints;
      `DASHBOARD_RESPONSE_VERSION` in the dashboard cache key's hashed input
- [x] B-44: `zStrictBooleanQuery` in `src/constants/zod/zod-rules.ts`; the three local copies
      removed; metric-settings uses it
- [x] B-46: `encodeSegmentText` in `src/shared/cache/keys.ts`; a missing user or organization
      passed through as the sentinel; four cursor versions 3 → 4
- [x] B-46: `metricLogsCursorCacheKey` in `metric-log/…/cache-keys.ts`; the router's hand-built
      key, its helpers, its `.js` sentinels and its debug line removed
- [x] B-45: `metricLogCacheKey` names the metric; `MetricLogCacheRedis` deletes
      `log:<org>:<user>:<id>:*`

## Phase 3 — docs and records

- [x] ADR-0075 (Proposed), its registry row; `CLAUDE.md` counts 75
- [x] `.claude/rules/api-design.md` § Response caching and the router example
- [x] the three todos closed; register rows B-43 to B-46 to Closed; #194's loose ends
- [x] Notion Part 2 record for the frontend (B-43)

## Discovered

- [x] Found: the first encoder change turned a missing user or organization, passed in as the text
      `"_"`, into `%5F`; the existing builder test caught it → in scope, missing values pass through
      as the sentinel
- [x] Found: bucket labels came back at 17:00 UTC on this machine, which runs at UTC+7; that is
      register row B-65 (labels read in the server process's zone) → out of scope; the new test
      matches buckets by position, not by date string
- [x] Found: `fill=zero` already gave both endpoints the zero; only `fill=none` on the dashboard
      was wrong

## Acceptance

- [x] AC-1 — `VisualizationReadRepoSequelize.integration.test.ts`, two cases
- [x] AC-2 — the schema test (10 cases) and `metric-settings.test.ts` (`false`, `true`, `yes`)
- [x] AC-3 — `single-log-cache.test.ts`, `cache-keys.test.ts` › `metricLogCacheKey`,
      `MetricLogCacheRedis.test.ts`
- [x] AC-4 — `keys.test.ts`, `metric-log/…/cache-keys.test.ts`; versions 4
- [x] AC-5 — changed only for version or format: `metric` and `metric-settings` cache-key tests
      (version 3 → 4); `VisualizationCacheRedis.test.ts` (the pinned dashboard key hash);
      `metric-log/…/router.test.ts` (the two key-builder cases now check which builder each route
      uses)
- [x] AC-6 — `docs:openapi:check` no drift; contract quick profile 36 passed, 6 skipped, the same
      two warnings

## Gates

- [x] typecheck
- [x] lint
- [x] format — named files only
- [x] tests — `test:coverage`: unit 1423 passed; integration 283 passed, 5 skipped; thresholds met
- [x] build
- [x] OpenAPI — no drift
- [ ] image smoke — skipped: no Docker or dependency changes
- [ ] security delta — skipped: no dependency changes
