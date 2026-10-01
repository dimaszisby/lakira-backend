# Todo — metric-log cache keys use literal `.js` placeholders

- **Status:** Open (P3)
- **Created:** 2026-10-01
- **Owner:** unassigned
- **Origin:** kit `list-cache-key-filters` (checklist § Discovered)

---

## What

`logsCursorCacheKey` in `src/features/public/metric-log/infrastructure/http/router.ts` defaults
empty segments to the literal strings `"_.js"` and `".js"` — an artifact of the sweep that added
`.js` to import paths. The key is consistent, so nothing is served wrongly, but it reads as a bug
and every "empty" segment differs from the `_` that `buildCursorCacheKey` uses elsewhere.

The key is also hand-rolled from raw `req.query`, the pattern `.claude/rules/api-design.md`
§ Response caching now rules out.

## Suggested fix

Move it to `metric-log/infrastructure/http/cache-keys.ts`, built from
`pickValidated(listMetricLogsViaCursorSchema)(req)` as metric and metric-settings do, and bump
`METRIC_LOG_CURSOR_VERSION`. Check every field the repository filters on is a segment.
