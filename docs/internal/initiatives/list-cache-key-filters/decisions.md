# List Cache Key Filters — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — The metric list cache key is built from the validated query

- **Status:** Accepted
- **Date:** 2026-10-01

**Context.** `metricsCursorCacheKey` read `req.query["filter[name]"]` and
`req.query["filter[categoryId]"]`. Express's `qs` parser nests `?filter[name]=run` as
`req.query.filter.name`, so both segments were always empty and every filtered list shared one
cache entry for 60 s. The schema `listMetricQueryViaCursor` already normalizes both spellings, and
`validate()` runs before `cacheMiddleware`.
**Decision.** Build the key from `pickValidated(getAllMetricsViaCursorSchema)(req).query` — the
same value the handler queries with — in a new `metric/infrastructure/http/cache-keys.ts`.
**Options considered.** Read both raw spellings in the key function, as `metric-log` and
`metric-settings` do: rejected, it repeats normalization the schema owns, and two copies drift.
That drift is exactly how this bug happened.
**Consequences.** A cache key can no longer disagree with the query it caches. Any future filter
added to the schema reaches the key only if the key function names it — the test pins the
current set.

## D-02 — Remove the router-level cache on the category list instead of fixing its key

- **Status:** Accepted
- **Date:** 2026-10-01

**Context.** `GET /metric-categories` is cached twice: by `cacheMiddleware` in the router (whole
HTTP response, broken key, `fn` defaulting to the literal `".js"`), and by `ListCategories` in the
application layer (the page, correct key from the normalized query). Both keys use the same
feature, version and segment labels. Fixing the router key to read the filter correctly would
make it byte-identical to the use case's key, and the middleware would then serve the use case's
cached `ListResult` as the HTTP body.
**Decision.** Drop `cacheMiddleware` from the category list route and delete `categoriesCacheKey`.
The use-case cache remains, and write-path invalidation (`cursor:metric-categories:v*:<user>:*`)
already covers it.
**Options considered.** Fix the router key and give it a distinct label: rejected, it keeps a
redundant second layer with its own TTL for no benefit.
**Consequences.** On a cache hit the controller still runs and serializes the cached page — cheap.
Where list caching lives now differs by feature (router for metrics, use case for categories);
unifying that is out of scope.

## D-03 — Bump `METRIC_CURSOR_VERSION` from 2 to 3

- **Status:** Accepted
- **Date:** 2026-10-01

**Context.** Entries written under the broken key can hold one filter's results under a key every
filter shares. After deploy they would keep serving for up to 60 s.
**Decision.** Version 3, so those entries are never read again.
**Options considered.** Let them expire: rejected, a one-line change removes a window of wrong
results. Flushing Redis on deploy: rejected, a deploy-time step for something a constant does.
**Consequences.** One cold cache per user at deploy. Invalidation matches `v*`, so it is
unaffected. Categories need no bump: the old middleware entries (`fn:.js`) are never read again.

## D-04 — The metric-settings list key is built from the validated query too

- **Status:** Accepted
- **Date:** 2026-10-01

**Context.** Found in review. `metricSettingsCursorCacheKey` (`metric-settings/…/http/router.ts`)
reads `filter.metricId` correctly but omits `filter.isActive` and `q`, both of which the
repository applies (`MetricSettingsRepositorySequelize.ts` `buildWhere`, lines 162 and 242). So
`?filter[isActive]=true` and `=false`, and any two `q` values, share one entry for 300 s — the
same class as D-01.
**Decision.** Same fix as D-01: a `metric-settings/…/http/cache-keys.ts` builds the key from
`pickValidated(listMetricSettingsViaCursorSchema)(req).query`, with every field the schema emits.
The feature and version constants move to `metric-settings/application/cache.constants.ts`, as the
other features have them, and the version goes from 2 to 3 for the reason in D-03.
**Options considered.** Add the two missing segments to the hand-rolled key: rejected for the
reason D-01 gives — the hand-rolled copy is what drifted.
**Consequences.** One cold settings-list cache per user at deploy.

## D-05 — Settings writes invalidate the settings list cache

- **Status:** Accepted
- **Date:** 2026-10-01

**Context.** Found while confirming D-04. `MetricSettingsCacheInvalidator` clears
`metricSettings:<org>:<user>:*`, a key format that survives only as a commented-out line in the
router. The list is cached under `cursor:metric-settings:v<N>:<user>:org:<org>:…`, which no write
ever clears, so `GET /metric-settings` serves the pre-write list for up to 300 s after any
create, update or delete. Its unit test asserts the dead pattern. The detail key
(`metricSetting:<org>:<user>:<id>`) is invalidated correctly.
**Decision.** The invalidator clears `cursor:metric-settings:v*:<user>:org:<org>:*` — the same
shape `MetricCacheRedis` uses for metrics — in place of the dead `metricSettings:` pattern and
the dead single-key delete. The detail-key delete stays.
**Options considered.** Keep the dead patterns alongside: rejected, they match nothing and mislead
the next reader. File it separately: rejected, it is in the same cache this kit is already
correcting, and leaving the list stale after writes would make the D-04 fix half a fix.
**Consequences.** A settings write now empties that user's settings-list pages in that org.
