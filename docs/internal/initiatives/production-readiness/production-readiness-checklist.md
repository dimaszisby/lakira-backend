# Production Readiness — Checklist

- Timestamp: 2026-05-03T00:00:00Z
- Plan: `./production-readiness-plan.md`
- Closes: [P1] 8.3, [P1] 8.4, [P1] 4.4, [P1] 7.1

## Phase A — Multi-stage Dockerfile

- [x] Stage 1 (build): `node:20-alpine`, `npm ci`, `npm run build`.
- [x] Stage 2 (runtime): copy `dist/`, `npm ci --omit=dev`, `USER node`, `dumb-init`.
- [x] `CMD ["node", "dist/server.js"]`.
- [x] Preserve or rename existing Dockerfile for local dev if needed. (`Dockerfile.dev` retains the old `npm run dev` flow; `docker-compose.yml` now points at it.)
- [ ] Docker build succeeds and image runs. _(Manual verification — host has no Docker daemon configured in this session.)_

## Phase B — Production deploy job

- [x] Add `deploy_production` job to `backend-ci.yml`.
- [x] Trigger on push to `main`, gated by `needs: contract_local` (matches `deploy_staging`).
- [x] Manual approval via `environment: production`.
- [x] Steps: `migrate:production:ci` + `RENDER_PRODUCTION_DEPLOY_HOOK_URL`.
- [x] Document `RENDER_PRODUCTION_DEPLOY_HOOK_URL` secret requirement. _(Inline comment on the job; must be configured in GitHub repo secrets.)_
- [x] Add `migrate:production:ci` npm script (uses raw `NODE_ENV=production` without dotenv, matching `migrate:staging:ci`).

## Phase C — Account lockout

- [x] Create lockout helper with Redis-backed per-email counter (`src/features/shared/auth/infrastructure/http/loginLockout.ts`).
- [x] Key format: `auth:lockout:<sha256(email)>`, TTL 900s (15 min).
- [x] Threshold: 5 failures → 429 with `Retry-After: 900`.
- [x] Reset counter on successful login (`resetLockout` after `LoginUser.execute`).
- [x] Structured log event `auth.lockout.triggered` via Winston (fires when `INCR` returns the threshold value).
- [x] Graceful degradation: allow login if Redis unavailable (logs `auth.lockout.redis_unavailable`).
- [x] Unit test with mock Redis (`__tests__/unit/features/auth/infrastructure/http/loginLockout.test.ts`).
- [x] Integration test: 6 wrong-password attempts → 429 on attempt 6 (`__tests__/integration/api/auth-lockout.test.ts`, gated by `ENABLE_REDIS_INTEGRATION`).

## Phase D — e2e Jest project

- [x] Add `e2e` project to `jest.config.mjs` with 30s timeout + dedicated `jest.setup.e2e.ts` (no per-test truncation).
- [x] Create `__tests__/e2e/` directory.
- [x] Write `auth-flow.e2e.test.ts` (register → login → protected endpoint → logout).
- [x] `npm run test:e2e` passes.

## Wrap-up

- [x] `npm run typecheck && npm run lint && npm run format:write && npm test` green.
- [x] `npm run test:e2e` green.
- [ ] Audit re-run grades 8.3, 8.4, 4.4, 7.1 as Pass. _(Pending follow-up audit pass.)_
