# Feature boundaries — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `ed0e783` (#211).

## Acceptance criteria

- **AC-1** — No two features depend on each other both ways, except metric with metric-log and
  metric with metric-settings (B-88); `architecture.test.ts` fails on a new pair. _Why:_ X48 (D-01).
- **AC-2** — Nothing under `src/features/public/metric-category/application` names
  `buildCursorCacheKey` or reads or writes the cache; the category-list-cache-dates integration
  test still passes. _Why:_ X49 (D-02).
- **AC-3** — `buildCursorCacheKey` takes `organizationId: string`. _Why:_ X49 (D-03).
- **AC-4** — "cache keys are tenant-scoped" reads `MetricSettingsCacheInvalidator.ts`. _Why:_ X49
  (D-04).
- **AC-5** — The model counter counts a single-quoted or digit-named import, and holds at 11.
  _Why:_ X52 (D-05).
- **AC-6** — The lint refuses `process` or `module` other than as `x.y` under `src`, and passes on
  `src`. _Why:_ X43's rest (D-06).
- **AC-7** — Every gate passes, and the OpenAPI spec is unchanged. _Why:_ no behaviour change.

## Phase 0 — kit and branch

- [x] `refactor/architecture-boundaries` cut with `--no-track` from `origin/dev` at `ed0e783`;
      HEAD and upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-06; D-07 added when CI failed
- [x] #211's loose ends: `architecture-dead-code` D-01 to D-05 Accepted, README Done; ADR-0022
      Accepted, in its file and the registry; "As of" `ed0e783`

## Phase 1 — guards first

- [x] `architecture.test.ts` › no two features depend on each other both ways: failed on `dev`,
      naming `analytics <-> metric` (AC-1)
- [x] `isCacheKeyFile` widened: the test read 18 files on `dev` and reads 20 now,
      `MetricSettingsCacheInvalidator.ts` among them (AC-4)
- [x] The counter's sample test: failed on `dev`, finding neither the single-quoted nor the
      digit-named import (AC-5)
- [x] `feature-boundaries.lint.test.ts` › process or module used other than as x.y: failed on
      `dev`, with nothing reported (AC-6)

## Phase 2 — the changes

- [x] D-01: `MetricTrendPort.ts`; metric's controller (the router takes the controller's parameter
      type); analytics' `public.ts`
- [x] D-02: `CachedMetricCategoryRepository.ts`; `ListCategories.test.ts` moved to
      `infrastructure/cache/CachedMetricCategoryRepository.test.ts`, its cases unchanged;
      `ListCategories`; `feature.ts`; `infrastructure/cache/cache.ts` deleted
- [x] D-03: `buildCursorCacheKey`; the three `cache-keys.ts`; their unit tests build an
      authenticated request, and metric's adds a case that throws with no organization;
      `keys.test.ts` no longer passes a missing organization
- [x] D-05: `MODEL_IMPORT`, `MODEL_IMPORT_TARGET`
- [x] D-06: `eslint.config.mjs`. `const { getBuiltinModule } = process` is reported by both rules:
      `no-restricted-properties` already reads a destructured member

## Phase 3 — gates, review, docs

- [x] Gates, below
- [x] Review of the diff. `ListCategories`' comment named the infrastructure class; reworded. A
      parameter named `process` or `module` is refused too, as a shadowing alias; `src` has none
- [x] ADR-0072 status note (D-01); ADR-0078 status note (D-06)
- [x] `.claude/rules/architecture.md` (the trend port, the both-ways test, `process` and `module`)
      and `.claude/rules/api-design.md` (a key requires an organization; the category cache)
- [x] Register: B-83's item names this slice and the branch; new row B-88
- [x] Notion Part 2: none

## Discovered

- metric depends both ways on metric-log and on metric-settings: out of scope, filed as register
  row B-88 and frozen by D-01's test.
- `src/features/public/metric-category/infrastructure/cache/cache.ts` has no caller: in scope, D-02.
- A race in the three email queue tests, which failed CI once on #212: in scope, D-07. Each of
  `PasswordResetEmailQueue`, `VerificationEmailQueue` and `InviteEmailQueue` now waits for the
  row it reads next to commit. With RabbitMQ on, the three suites passed 4 runs of 4 locally

## Acceptance

- [x] AC-1 — `architecture.test.ts` › no two features depend on each other both ways;
      `grep -rn analytics src/features/public/metric` finds two comments and no import
- [x] AC-2 — `application/` names no `buildCursorCacheKey`, `cache.get` or `cache.set`;
      `metric-category-list-cache.test.ts` passes
- [x] AC-3 — typecheck, with `keys.test.ts` changed to pass one
- [x] AC-4 — the tenant-scope test lists `MetricSettingsCacheInvalidator.ts`
- [x] AC-5 — "counts a model import in either spelling"; the count holds at 11
- [x] AC-6 — `feature-boundaries.lint.test.ts` › process or module; `npm run lint` clean
- [x] AC-7 — the gates below

## Gates

Node 24.22.0; integration against throwaway Postgres 18 and Redis 7, migrated with `migrate:test`.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 149 suites, 1531 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 303 tests passed (6 skipped),
      thresholds met, rerun with RabbitMQ on after D-07
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean, spec unchanged
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
