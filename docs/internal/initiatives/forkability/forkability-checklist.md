# Forkability — Checklist

- Timestamp: 2026-05-03T00:00:00Z
- Plan: `./forkability-plan.md`
- Closes: [P1] 11.2, [P1] 11.3, [P1] 11.4, [P2] 11.5

## Phase A — Centralize APP_NAME

- [x] Create `src/config/app-name.ts` with env-driven `APP_NAME`.
- [x] Update `src/server.ts` log strings.
- [x] Update `src/utils/logger.ts` service name.
- [x] Update `src/lib/openapi/openapi-config.ts` API title.
- [x] Update `src/shared/infrastructure/queue/topology.ts` queue prefix.
- [x] Update `password-reset.ts` email template branding.
- [x] Update `organization-invite.ts` and `email-verification.ts` email templates.
- [x] Update `src/features/shared/auth/infrastructure/http/controller.ts` cookie name.
- [x] Update `src/lib/openapi/openapi-docs.ts` cookie name references.
- [x] Add `APP_NAME` to `src/config/zodEnv.ts` as optional.
- [x] Add `APP_NAME` to `.env.example`.
- [x] Verify: zero `lakira` matches in `src/**/*.ts` outside `app-name.ts`.

## Phase B — Bootstrap script

- [x] Create `scripts/bootstrap-fork.sh` with `--name` flag.
- [x] Script replaces branding in `package.json`, `package-lock.json`, `docker-compose.test.yml`.
- [x] Script replaces branding in CI workflow files.
- [x] Script replaces branding in script files under `scripts/`.
- [x] Script rotates `JWT_SECRET` in `.env.development`.
- [x] Script drops `FORKED-FROM.md` with upstream commit SHA.
- [x] Script is idempotent (safe to run twice).
- [x] Add "Forking" section to `README.md`.
- [x] Verify: `npm run typecheck && npm run lint` pass in a temp worktree after running the script.

## Phase C — CONTRIBUTING.md

- [x] Create `CONTRIBUTING.md` at repo root.
- [x] Document branch model, commit conventions, code style links, testing links.
- [x] Note single-developer status and external PR expectations.

## Phase D — Consolidate CachePort

- [x] Create `src/shared/application/ports/CachePort.ts` with generic interface.
- [x] `metric-category/application/ports/CachePort.ts` extends the shared generic (`CachePort<unknown>`) and adds domain extras (`isEnabled`, `delByPattern`).
- [x] `metric-category` Redis adapters (`MetricCategoryCacheRedis`, `RedisCacheAdapter`) implement shared generic + `delete`.
- [x] `buildMetricCategoryFeature()` cache dependency typed as `CachePort`.
- [ ] `metric/application/ports/CachePort.ts` — **Not replaced**: this is a domain-specific cache-invalidation port (`invalidateMetrics`), not a generic key-value cache. Kept as-is to avoid breaking existing behaviour.
- [ ] `metric-log/application/ports/CachePort.ts` — **Not replaced**: same reason (domain-specific `invalidate`).
- [ ] `metric-settings/application/ports/CacheInvalidationPort.ts` — **Not replaced**: already named differently; different concern.
- [ ] `analytics/application/ports/VisualizationCachePort.ts` — **Not replaced**: visualization-specific methods; not a generic cache.
- [x] `npm run typecheck` green.
- [x] Cache-related unit tests green.

## Wrap-up

- [x] `npm run typecheck && npm run lint && npm run format:write && npm test` green.
- [ ] Audit re-run grades 11.2, 11.3, 11.4, 11.5 as Pass.
