# 2025-12-15 – Controller Test Stability Log

## Context

- `npm run test:dev` began failing after refreshing Docker services. Initial root cause was missing `GetMetricSettings`/`ListMetricSettingsViaCursor` files, followed by `SequelizeHostNotFoundError` because the Postgres container was down. We restarted the Lakira Docker stack and aligned `.env.development` with the `lakira_user` role created via the compose init scripts.
- Once DB connectivity was restored, two suites still failed consistently:
  - `__tests__/features/metric-log/infrastructure/http/controller.test.ts`
  - `__tests__/features/metric/infrastructure/http/controller.test.ts`
    Both suites call controllers directly (no router middleware), so `req.validated` was `undefined` and each controller returned before invoking the mocked feature use cases. Jest then reported “Number of calls: 0.”

## Changes

1. **Validation helper hardening** (`src/shared/middleware/validated.ts`)
   - Added a fallback to `safeParse` the provided schema whenever `req.validated` is missing.
   - Cache the parsed bag back on `req.validated` to keep the runtime behavior identical for real HTTP requests while allowing unit tests to succeed without wiring middleware.
2. **Controller test fixtures**
   - Updated `__tests__/features/metric-log/infrastructure/http/controller.test.ts` and `__tests__/features/metric/infrastructure/http/controller.test.ts` to use UUID fixtures so they satisfy the Zod schemas that now run inside the fallback parse.
3. **Docker alignment**
   - Restarted compose stack, confirmed Postgres/Redis health, and switched `.env.development` to `DB_USER=lakira_user` / `DB_PASSWORD=lakira_password` to match the persisted role from `docker/db/init`.

## Verification

- Targeted runs with database connectivity re-enabled:
  ```bash
  DB_HOST=127.0.0.1 npm run jest -- --runInBand __tests__/features/metric-log/infrastructure/http/controller.test.ts
  DB_HOST=127.0.0.1 npm run jest -- --runInBand __tests__/features/metric/infrastructure/http/controller.test.ts
  ```
  Both suites now pass (5/5 and 3/3 tests respectively).
- When running the full suite with `npm run test:dev`, failures were due to Jest watch reusing port `4001`. Mitigation: set `SKIP_DB_LIFECYCLE=true` for controller-only suites or run without `--watch` to avoid colliding Express servers.

## Follow-ups

- Keep `docs/internal/todos/` for scratch notes, but archive lasting findings (like this validation helper change) into `docs/internal/dev-log/` to aid future debugging.
- When invoking controller suites locally, prefer:
  ```bash
  SKIP_DB_LIFECYCLE=true DB_HOST=127.0.0.1 npm run jest -- --runInBand path/to/controller.test.ts
  ```
  This bypasses the Express server bootstrap entirely and prevents `EADDRINUSE` noise during targeted runs.
