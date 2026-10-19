# Category list cache dates — Checklist

## Acceptance criteria

A Lean kit has no plan, so the criteria are stated here.

- **AC-1** — With a cache that stores JSON as Redis does, `GET /metric-categories` asked twice
  with the same query answers 200 both times, with the same body, the frontend's query
  (`limit=50&sort=-createdAt&includeTotal=true`) among the cases.
  _Why:_ the frontend's P1; every repeat answered 500.
- **AC-2** — The second answer comes from the cache.
  _Why:_ a fix that stops caching would pass AC-1.
- **AC-3** — A cached entry in the old `{ props }` shape, or any other shape, is a miss and
  answers 200.
  _Why:_ staging's Redis may still hold entries the old code wrote.
- **AC-4** — Creating a category after the list was cached shows it on the next list.
  _Why:_ the version bump must not break invalidation.
- **AC-5** — No response or OpenAPI change; the existing category tests pass unchanged.
  _Why:_ the frontend depends on the body.

## Phase 0 — kit and branch

- [x] `fix/category-list-cache-dates` cut with `--no-track` from `origin/dev` at `f6ec4a5`; HEAD
      and upstream verified
- [x] `README.md`, this file, `decisions.md` D-01

## Phase 1 — the fix

- [x] `__tests__/integration/api/metric-category-list-cache.test.ts`, written first: on the code
      before the fix, three of its four cases failed with 500
- [x] `application/queries/ListCategories.ts` — caches a snapshot, rebuilds entities on a hit, a
      wrong shape is a miss
- [x] `application/cache.constants.ts` — `METRIC_CATEGORY_CURSOR_VERSION` 3
- [x] `__tests__/unit/features/metric-category/application/ListCategories.test.ts` — a JSON
      round-trip case and three wrong-shape cases

## Discovered

- [x] Found: the existing `ListCategories.test.ts` cases built a fake entity with only a name,
      which the snapshot cannot read → in scope, the fixture builds a real entity; both cases'
      assertions are unchanged

## Acceptance

- [x] AC-1 — `metric-category-list-cache.test.ts` › "answers a repeat of the frontend's query
      with the same 200, from the cache", "… of the default query …"
- [x] AC-2 — the same cases check the cache holds the entry; `ListCategories.test.ts` › "rebuilds
      entities, with their dates, from what Redis returns" (the repository is called once)
- [x] AC-3 — › "treats an entry in another shape as a miss"; `ListCategories.test.ts` › "treats a
      cached entry holding … as a miss" (three shapes)
- [x] AC-4 — › "shows a category created after the list was cached"
- [x] AC-5 — `metric-category.test.ts` passes unchanged; OpenAPI shows no drift

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — `test:coverage`: unit 1293 passed; integration 273 passed, 5 skipped
- [x] build
- [x] OpenAPI — no drift
- [ ] security delta — skipped: no dependency changes
- [ ] image smoke — skipped: no Dockerfile or dependency changes
