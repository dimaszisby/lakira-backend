# Decisions — category-list-cache-dates

## D-01 — The list cache holds a snapshot and rebuilds entities on a hit

- **Status:** Accepted (merged in #188, `f5eea43`)
- **Date:** 2026-10-19

**Context.** `ListCategories` cached the repository's page of `MetricCategory` entities, and the
Redis adapter runs `JSON.stringify`. An entity keeps its fields in a private `props` and exposes
them through getters, so the cache held `{ props: { ... } }` with string dates. On a hit the
controller got plain objects, `toResponseDTO` read `createdAt` as `undefined`, and every repeat of
a list query answered 500. Redis is off in tests, and the unit test's cache kept object
references, so nothing went through the JSON round trip. No other feature caches entities: the
rest cache the response body through `cacheMiddleware`, and analytics caches response-shaped
objects.
**Decision.** `ListCategories` writes each item as plain fields with ISO date strings, and on a
hit rebuilds entities with `MetricCategory.fromProps`. An entry that is not that snapshot is a
miss, read from the database and overwritten. `METRIC_CATEGORY_CURSOR_VERSION` goes from 2 to 3,
so entries already written in the broken shape are never read; they expire within 300 s.
Invalidation matches every version (`cursor:metric-categories:v*`), so it still clears them.
**Options considered.** Cache the response DTO through `cacheMiddleware`, as the other lists do:
the router-level layer was removed because it keyed on raw `req.query` and ignored the name filter
(`list-cache-key-filters` D-02). Give the entity a `toJSON`: a domain entity would then encode a
storage format. Turn Redis on in the integration suite: a larger change, and a JSON round-trip
cache in the test proves the same thing.
**Consequences.** The cache layer validates what it reads, so a future change to the snapshot's
shape is a miss, not a 500. The integration test's cache stores JSON, as Redis does.
