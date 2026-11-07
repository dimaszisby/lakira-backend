# Production Readiness — Plan

- Timestamp: 2026-05-03T00:00:00Z
- Closes audit gaps: [P1] 8.3, [P1] 8.4, [P1] 4.4, [P1] 7.1 in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`

## Context & Goals

The audit found four production-readiness gaps: the Dockerfile runs `npm run dev` (tsx watch) instead of a production build, there is no production deploy job in CI, the login endpoint lacks per-account brute-force protection, and the `test:e2e` script references a non-existent Jest project. This kit fixes all four.

## Phase A — Multi-stage Dockerfile [P1-8.3]

**Goal:** Production-grade container image.

1. **Stage 1 — build:**
   - Base: `node:20-alpine`.
   - `WORKDIR /app`, copy `package*.json`, `npm ci`.
   - Copy source, `npm run build`.
2. **Stage 2 — runtime:**
   - Base: `node:20-alpine`.
   - Install `dumb-init` (`apk add --no-cache dumb-init`).
   - Copy from build stage: `dist/`, `package*.json`.
   - `npm ci --omit=dev` (production deps only).
   - `USER node`.
   - `ENTRYPOINT ["dumb-init", "--"]`, `CMD ["node", "dist/server.js"]`.
3. **Keep existing Dockerfile as `Dockerfile.dev`** if the team still needs it for local development, or update `docker-compose.yml` to use the new multi-stage with a build target.
4. Verify: `docker build -t lakira-backend:test . && docker run --rm lakira-backend:test node -e "console.log('ok')"`.

## Phase B — Production deploy job [P1-8.4]

**Goal:** CI/CD pipeline deploys to production from `main`.

1. **Add `deploy_production` job** to `.github/workflows/backend-ci.yml`:
   - Trigger: push to `main` (mirroring `deploy_staging` on `staging`).
   - Gate: `needs: [test, lint]` (same as staging).
   - Add manual approval via `environment: production` with required reviewers (GitHub environment protection rules).
   - Steps: `npm run migrate:production` (if applicable), then call `RENDER_PRODUCTION_DEPLOY_HOOK_URL`.
2. **Document the required secret** `RENDER_PRODUCTION_DEPLOY_HOOK_URL` in `.env.example` or a deployment doc.
3. **Add `migrate:production`** npm script if it doesn't exist (points to production DB URL).
4. Verify: CI YAML passes `actionlint` or manual review; the job appears in GitHub Actions UI.

## Phase C — Account lockout [P1-4.4]

**Goal:** Per-email brute-force protection on the login endpoint.

1. **Create lockout middleware/helper** in `src/features/shared/auth/infrastructure/http/` or `src/shared/middleware/`:
   - Redis key: `auth:lockout:<sha256(email)>` (hash to avoid PII in Redis).
   - Sliding window: increment on failed login, TTL = 15 minutes.
   - Threshold: 5 failed attempts → return 429 with `Retry-After` header.
   - Reset counter on successful login.
2. **Wire into the login route** — apply before the use case executes (or after, on failure — either works; after is more precise).
3. **Structured logging** — emit `auth.lockout.triggered` event via Winston when a lockout activates.
4. **Graceful degradation** — if Redis is unavailable, log a warning and allow login (don't block auth because the rate store is down).
5. Verify: unit test with mock Redis; integration test hitting the login endpoint 6 times with wrong password → 429 on attempt 6.

## Phase D — e2e Jest project [P1-7.1]

**Goal:** Fix the broken `npm run test:e2e` script.

1. **Add third Jest project** in `jest.config.mjs`:
   ```js
   {
     displayName: "e2e",
     testMatch: ["<rootDir>/__tests__/e2e/**/*.test.ts"],
     testTimeout: 30_000,
     // full server boot — same setup as integration but longer timeout
   }
   ```
2. **Create `__tests__/e2e/` directory** with a placeholder test.
3. **Write `auth-flow.e2e.test.ts`** covering the golden path: register → login → access protected endpoint → logout. Uses `supertest` against the full Express app (no mocks).
4. **Verify:** `npm run test:e2e` passes.

## Dependencies & Risks

- Phase A: changing the Dockerfile may affect any developer using `docker compose up`. Communicate the change and provide `Dockerfile.dev` if needed.
- Phase B: requires `RENDER_PRODUCTION_DEPLOY_HOOK_URL` secret to be configured in GitHub — document this as a setup step.
- Phase C: depends on Redis being available. The graceful-degradation fallback avoids hard failures but means lockout doesn't work without Redis. Acceptable tradeoff.
- Phase D: e2e tests require both PostgreSQL and Redis running. CI already has these for integration tests, so no new infrastructure.

## References

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md` § 4.4, 7.1, 8.3, 8.4
- `docs/internal/audits/saas-readiness/iteration-plan.md` — Phase 7
- `docs/reference/ci-pipeline/strategy.md` — existing CI/CD documentation
