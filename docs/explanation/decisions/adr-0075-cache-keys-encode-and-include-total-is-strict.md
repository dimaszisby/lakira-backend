# ADR-0075 — A cache key encodes what it is given, and a list's `includeTotal` is strict

- **Status:** Proposed
- **Date:** 2026-10-20
- **Related:** [ADR-0035](./adr-0035-tenant-scoped-cache-keys.md) (cache keys are a tenant
  boundary); kit `list-cache-key-filters` (keys built from the validated query)
- **Origin:** `D-01` to `D-05` in the query-values-mean-what-they-say kit —
  [`query-values-mean-what-they-say`](../../internal/initiatives/query-values-mean-what-they-say/decisions.md);
  register rows B-43, B-44, B-45, B-46 (audits 2026-09-29 R13, 2026-10-03 S12, 2026-10-05 T5)

---

## Context

Four places where what a client sent, or got back, did not mean what it said. Checked on `dev` at
`fa7c497`:

- `buildCursorCacheKey` only trimmed a string segment. A search holding `:` could shift into the
  next segment (`q=x:fn:y` with no name filter gave the key of `q=x` with the name filter
  `y:fn:_`), and a search for `_` gave the key of no search, `_` being the empty sentinel. All four
  cursor caches build their keys there.
- The metric-log list key was hand-built from raw `req.query`, with `"_.js"` and `".js"` as empty
  sentinels, and logged itself, search text included.
- The single-log key was `log:<org>:<user>:<id>`. The handler answers 404 when the log belongs to
  another metric than `?metricId`, so a 200 cached under its own metric was replayed for any other.
- `GET /metric-settings` read `includeTotal` with `z.coerce.boolean()`, which is `Boolean(value)`:
  `"false"` and `"0"` meant true. The other three lists used a strict parser, declared three times.
- A dashboard bucket averaging exactly 0 was returned as `null`, the same as an empty bucket; the
  single-metric endpoint kept the zero.

## Decision

1. **A string segment is encoded.** `encodeURIComponent`, with `_` and `*` encoded by hand. An id,
   a number or a plain word comes out unchanged, so invalidation patterns that name one still
   match. A missing user or organization is the `_` sentinel, not the text `_`. Each cursor
   version goes from 3 to 4.
2. **Every list's `includeTotal` is `zStrictBooleanQuery`** (`src/constants/zod/zod-rules.ts`):
   `true` or `false`, in any case. Anything else is a 400, as on the other three lists already.
   The OpenAPI type stays `boolean`.
3. **The metric-log keys are built from the validated query** in
   `…/metric-log/infrastructure/http/cache-keys.ts`, as the metric and metric-settings keys are.
4. **A single resource's key names every value the handler checks it against.** The single-log
   key is `log:<org>:<user>:<id>:m:<metricId>`; invalidation deletes `log:<org>:<user>:<id>:*`.
5. **A bucket's value is decided by its count.** A bucket with logs gives its average, zero
   included; an empty one gives `0` with `fill=zero` and `null` otherwise. Both endpoints share
   the rule. The dashboard cache key's hashed input carries a response version.

## Options considered

- _Hash every key, as the analytics keys are._ It removes the ambiguity too, but the cursor keys
  are invalidated by pattern on their segments (`fm:<metricId>`), which a hash would hide.
- _Keep `z.coerce.boolean()` and accept `"false"` as a special case._ The other lists already
  refuse unknown values; one rule for all four is simpler to keep right.

## Consequences

- Every cursor cache and the dashboard cache start cold once after deploy (TTLs of 300 s and
  120 s).
- A client sending `includeTotal=0`, `1` or `yes` to `GET /metric-settings` gets a 400. The
  frontend sends `true` or nothing.
- A chart whose bucket averaged 0 now draws 0 where it drew a gap.

## Enforcement

- `__tests__/unit/shared/cache/keys.test.ts` — the separator, sentinel and glob cases; ids
  unchanged.
- `__tests__/unit/features/metric-log/infrastructure/http/cache-keys.test.ts` and
  `single-log-cache.test.ts` — the metric-log keys, and the real middleware not replaying a 200
  for another metric.
- `metric-settings` schema and API tests — `includeTotal`.
- `VisualizationReadRepoSequelize.integration.test.ts` — a zero average and an empty bucket on both
  endpoints.

## Links

- Kit: [`query-values-mean-what-they-say`](../../internal/initiatives/query-values-mean-what-they-say/README.md)
