---
paths:
  - "src/config/**"
  - "env.*"
  - ".env*"
---

# Environment Configuration

## Env Loading Pattern

All environment access goes through `loadEnvOrExit()` from `src/config/envManager.ts`:

- Validates against Zod schema in `src/config/zodEnv.ts`
- Returns a cached singleton — never re-reads `.env` after first call
- Crashes the process on invalid/missing required vars (fail-fast)

For tests: `resetEnvCacheForTesting()` clears the cache so test env can be reloaded.

## Key Environment Variables

- `NODE_ENV`: `"development" | "test" | "staging" | "production"` (default: `"development"`), in
  any case. The schema is built from the lowercased value, so a default that depends on
  `NODE_ENV` reads the `nodeEnv` argument of `buildEnvSchema`, never `process.env.NODE_ENV`
- `PORT`: number (default: 5000)
- `JWT_SECRET`: required, no default. In `production` and `staging` startup refuses one shorter
  than 32 characters, and the `.env.example` placeholder (ADR-0036)
- Database TLS: `DB_SSL_REJECT_UNAUTHORIZED` defaults to `true` in staging and production;
  production refuses `false`, staging may set it with a warning. `DB_SSL_CA` holds a PEM CA to
  trust (ADR-0036)
- Database: `DATABASE_URL` or per-env URLs (`DEVELOPMENT_DATABASE_URL`, `TEST_DATABASE_URL`, `STAGING_DATABASE_URL`, `PRODUCTION_DATABASE_URL`), or individual `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Redis: `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`; `REDIS_REQUIRED` (boolean)
- Rate limits: `RATE_LIMIT_GLOBAL_MAX`, `RATE_LIMIT_USER_MAX`, `RATE_LIMIT_ANALYTICS_MAX`,
  `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_AUTH_SESSION_MAX` and the rest in `docs/reference/configuration.md`
- Feature flags: `ENABLE_DUMMY_ENDPOINTS`, `ALLOW_TEST_HTTP_SERVER`, `ENABLE_REDIS_INTEGRATION`
- HTTP: `REQUEST_BODY_LIMIT` (default: `"1mb"`), `SWAGGER_REQUIRE_AUTH`

## Adding New Env Variables

1. Add to Zod schema in `src/config/zodEnv.ts` with type, default, and description
2. Use in code via `const env = loadEnvOrExit(); env.YOUR_VAR`
3. Add to `.env.test.example` if needed for test setup
4. If sensitive, it auto-masks in logs — the live pattern is `SENSITIVE_KEY_PATTERN` in
   `src/config/sensitive-keys.ts`. Name new secrets so they match it, or add a term there.
