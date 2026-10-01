# List Cache Key Filters — Checklist

Lean kit: acceptance criteria are stated here.

## Phase 0 — Kit and branch

- [x] `dev` synced to `2fd4e29`; branch `fix/list-cache-key-filters` off it, `--no-track`
- [x] Kit: `README.md`, this checklist, `decisions.md` (D-01–D-03)

## Phase 1 — Code

- [x] `src/features/public/metric/infrastructure/http/cache-keys.ts` — `metricsCursorCacheKey`
      from `pickValidated`; `router.ts` imports it
- [x] `src/features/public/metric/application/cache.constants.ts` — `METRIC_CURSOR_VERSION = 3`
- [x] `src/features/public/metric-category/infrastructure/http/router.ts` — list-route
      `cacheMiddleware` and `categoriesCacheKey` removed

## Phase 2 — Tests

- [x] `__tests__/unit/features/metric/infrastructure/http/cache-keys.test.ts` — four cases, shown
      failing on the old function moved verbatim: 4/4 failed, both filtered keys were
      `…fn:_:fc:_…`
- [x] `__tests__/unit/features/metric/infrastructure/http/router.test.ts` — the flat-key fixture
      test replaced by a wiring assertion
- [x] `__tests__/unit/features/metric-category/application/ListCategories.test.ts` — distinct keys
      per filter (a guard on the remaining layer; it passes on the old code too)

## Discovered

- [x] Found: `filter[categoryId]` on `GET /metrics` had the same bug as `filter[name]` (the todo
      named only the name filter) → in scope, covered by AC-2
- [x] Found: `GET /metric-categories` was cached twice, and fixing the router key would have made
      it byte-identical to the use case's key → in scope, decided as D-02 (layer removed)
- [x] Found in review: `GET /metric-settings` key omits `filter[isActive]` and `q`, both applied by
      the repository → in scope (same class), D-04: `metric-settings/…/http/cache-keys.ts` from
      `pickValidated`, constants moved to `application/cache.constants.ts`, version 2 → 3. New
      `cache-keys.test.ts`: the `isActive`, `q` and `v3` cases failed on the old function moved
      verbatim; the flat/nested `metricId` case passed (the old key handled that one field)
- [x] Found while confirming it: the settings list cache was never invalidated — the invalidator
      cleared `metricSettings:<org>:<user>:*`, a format nothing writes → in scope, D-05: it now
      clears `cursor:metric-settings:v*:<user>:org:<org>:*`; its test, which asserted the dead
      pattern, failed on the old code
- [x] Found: `GET /metric-settings` parses `includeTotal` with `z.coerce.boolean`, so `"false"` is
      `true` (probed) → out of scope (validation, not caching), filed as
      `docs/internal/todos/2026-10-01-todo-metric-settings-include-total-coercion.md`
- [x] Found: `metric-log` cache keys use the literal placeholders `"_.js"` and `".js"` → out of
      scope (harmless, and changing them changes live keys), filed as
      `docs/internal/todos/2026-10-01-todo-metric-log-cache-key-js-artifacts.md`

## Acceptance

- [x] AC-1 — different `filter[name]` values on `GET /metrics` never share a cache entry
- [x] AC-2 — different `filter[categoryId]` values on `GET /metrics` never share a cache entry
- [x] AC-3 — the flat (`filter[name]`) and nested (`filter.name`) spellings of one filter share
      one entry
- [x] AC-4 — `GET /metric-categories` is cached by one layer, and that layer keys on the filter
- [x] AC-5 — nothing written under the old metric key format is read after deploy
- [x] AC-6 — different `filter[isActive]` and `q` values on `GET /metric-settings` never share a
      cache entry (`metric-settings/…/cache-keys.test.ts`; manual run: `fa:1` / `fa:0` keys)
- [x] AC-7 — a settings write clears that user's settings-list pages in that org
      (`MetricSettingsCacheInvalidator.test.ts`; manual run: HIT, delete, MISS with 1 row of 2)

## Gates

Final tree, Node 24.21.0, 2026-10-01.

- [x] typecheck — pass
- [x] lint — pass, 0 warnings
- [x] format — pass
- [x] tests — unit 662 pass (649 + 4 metric key + 4 settings key + 2 `ListCategories` + 3
      architecture cases for the new files); integration 217 pass, 5 skipped
- [x] build — pass
- [x] OpenAPI — `docs:openapi:check` pass, no drift
- [x] security delta — skipped, no dependency change
- [x] extra: `contract:local:gate` — pass; seed 42, 42/47 selected, 1442 generated, the 2 known
      warnings
- [x] extra: manual Redis-backed runs —
  - metrics: `filter[name]=Run` and `=Swim` cached under `…v3:…:fn:Run:…` and `…:fn:Swim:…`, each
    returned only its own metric, a repeat was a HIT
  - categories: a filtered list logged no router-level cache line
  - settings: `filter[isActive]=true` / `=false` keyed `fa:1` / `fa:0` and returned 2 / 0 rows; a
    cached list (HIT) was cleared by a delete (`cursor:metric-settings:v*:…` deleted) and the next
    request missed and returned 1 row

## Docs

- [x] `2026-09-29-todo-list-cache-key-nested-filters.md` — fixed, with the category-filter finding
- [x] `SAAS-BASE-CHECKLIST.md` § Top gaps item 4 — fix merged, pending a dated run
- [x] `docs/explanation/architecture/shared-middleware.md` — cache key rule
- [x] rules file — cache key rule
- [x] `2026-10-01-todo-metric-log-cache-key-js-artifacts.md` — filed
- [x] `deterministic-query-ordering/README.md` — merged in #125
- [x] `2026-10-01-todo-metric-settings-include-total-coercion.md` — filed

## Review

`code-reviewer` pass: 0 critical, 1 warning, 3 suggestions, verdict approve.

- Warning: the settings list key omits `isActive` and `q` — confirmed against the repository and
  fixed here (D-04); confirming it surfaced the dead invalidation pattern (D-05).
- Hand-rolled keys in metric-log and settings — settings done; metric-log filed as a todo.
- `asString` still used by the metric detail key — no action.
- `ListCategories.test.ts` cannot catch the router layer coming back — accepted: there is no
  category router test harness to extend, and `api-design.md` § Response caching now states the
  one-layer rule.
