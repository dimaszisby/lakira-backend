# Test Failures – 2025-12-02

> Generated: 2025-12-02 07:31:50 UTC  
> Context: `npm run test:dev` against Docker-backed Postgres/Redis (host-overrides for DB/Redis)

## 1. `__tests__/unit/features/analytics/application/GetDashboardVisualization.service.test.ts`

- **Failure mode:** TypeScript compilation halts because mocked `.query` calls return plain arrays whose shape (`{ metric_id: ... }`) does not match the inferred `[unknown[], unknown]` tuple signature.
- **Impact:** Entire suite never executes; other suites depending on `ts-jest` stop at compile error.
- **Log snapshot (07:30 UTC):**
  ```text
  __tests__/unit/features/analytics/application/GetDashboardVisualization.service.test.ts:41:11 - error TS2353: Object literal may only specify known properties, and 'metric_id' does not exist in type 'unknown[]'.
  ...
  55       .mockResolvedValueOnce([])
                                   ~~
  __tests__/unit/features/analytics/application/GetDashboardVisualization.service.test.ts:55:30 - error TS2345: Argument of type '[]' is not assignable to parameter of type '[unknown[], unknown]'
  ```
- **Plan**
  - [x] 2025-12-02 09:25 UTC – Relaxed the spy typing to `jest.MockedFunction<(...args) => Promise<any>>` and reverted mocks to return the same row arrays the SELECT query produces (no tuple juggling required).
  - [x] 2025-12-02 09:25 UTC – Re-ran `DB_HOST=127.0.0.1 REDIS_REQUIRED=false NODE_ENV=test npm run jest -- __tests__/unit/features/analytics/application/GetDashboardVisualization.service.test.ts --runInBand`; suite now passes (see PASS log in terminal snippet above).

## 2. `__tests__/unit/features/analytics/domain/fallback-range.test.ts`

- **Failure mode:** `computeFallbackRange` returns a ~30-day interval (`2592000000ms`) while the spec expects ≤5 days (`432001000ms`) when clamping after bucket coarsening.
- **Impact:** Regression coverage for fallback guard is broken; actual API may now exceed FE constraints.
- **Log snapshot:**

  ```text
  expect(received).toBeLessThanOrEqual(expected)

  Expected: <= 432001000
  Received:    2592000000

    43 |       new Date(result!.range.endISO).getTime() -
    44 |         new Date(result!.range.startISO).getTime()
  > 45 |     ).toBeLessThanOrEqual(5 * 24 * 60 * 60 * 1000 + 1000);
  ```

- **Plan**
  - [x] 2025-12-02 09:18 UTC – Added a guard-span clamp (`guardBuckets * requestedBucket.approxMs`) after bucket coarsening so the actual window never exceeds the guard, then recalculated `estimatedBuckets`.
  - [x] 2025-12-02 09:18 UTC – Re-ran `npm run jest -- __tests__/unit/features/analytics/domain/fallback-range.test.ts --runInBand`; all three unit cases now pass.

## 3. API Integration Suites (`auth`, `metric*`, `analytics`)

- **Failure mode:** `createTestUser` hits `/api/v1/auth/register` but the controller throws a Sequelize error before inserts run (stack traces from `auth.service.ts:41`). Subsequent tests fail due to missing seed user or token.
- **Likely cause:** Test database lacks migrated tables or baseline seed data—`scripts/test-ci.sh` runs migrations, but the host workflow skipped `npx sequelize-cli db:migrate --config src/config/config.cjs`.
- **Impact:** 46/50 tests fail; no coverage for business endpoints.
- **Log snapshot:**
  ```text
  Error:
      at Query.run (.../node_modules/sequelize/src/dialects/postgres/query.js:76:25)
      ...
      at Module.registerUserService (src/services/auth.service.ts:41:24)
  Failed to create test user: 500 {"status":"error","message":"Internal Server Error"}
  ```
- **Plan**
  - [x] 2025-12-02 09:15 UTC – Ran `TEST_DATABASE_URL=postgres://lakira_user:lakira_password@127.0.0.1:5432/lakira_test_db DB_HOST=127.0.0.1 NODE_ENV=test npx sequelize-cli db:migrate --config src/config/config.cjs`; all migrations succeeded against the Docker Postgres container.
  - [x] 2025-12-02 09:26 UTC – Verified `__tests__/auth.test.ts` via `npm run jest -- __tests__/auth.test.ts --runInBand`; the suite now passes (9/9 tests) confirming the schema + seed flow work locally.
  - [x] 2025-12-02 09:35 UTC – Documented the host override + CLI command in `docs/how-to/development/run-postgres-in-docker.md` and referenced it from the analytics testing checklist.

## 4. Redis teardown noise

- **Failure mode:** `jest.setup.ts` calls `disconnectRedis()` during `afterAll`, but in host runs Redis never connected (`REDIS_REQUIRED=false`), so `redisClient.quit()` throws “The client is closed.”
- **Impact:** Non-fatal noise and confusing stack traces appended to every suite failure.
- **Log snapshot:**
  ```text
  Error: The client is closed
      at RedisSocket.quit (.../node_modules/@redis/client/dist/lib/client/socket.js:70:19)
      at Commander.QUIT (.../node_modules/@redis/client/dist/lib/client/index.js:260:71)
      at disconnectRedis (src/utils/redis-client.ts:58:23)
      at Object.<anonymous> (jest.setup.ts:92:11)
  ```
- **Plan**
  - [x] 2025-12-02 09:18 UTC – Added an early-return + info log in `disconnectRedis` (and guarded `getCachedViz` / `setCachedViz`) so teardown is silent when Redis never connected.
  - [ ] [Optional] Backfill a small unit test around the helper; low priority since Jest logs now confirm “[PROCESS] Redis client already closed.”

## 5. General Observability / Debugging Aids

- [x] 2025-12-02 09:40 UTC – Added an auth controller log hook that records `[AUTH] Registration failed` with the incoming email + error message before bubbling to the error handler.
- [x] 2025-12-02 09:37 UTC – Removed `globals["ts-jest"]` usage in `jest.config.mjs` and relied solely on the `transform` block per ts-jest deprecation notice.

> Re-run sequence once fixes land: `npm run test:dev -- --runInBand` (after ensuring Docker `db`/`redis` + migrations are ready).
