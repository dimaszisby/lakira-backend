# Security Audit Log – Baseline (Simple)

- **Generated:** Fri Nov 21 17:19:29 WIB 2025
- **Scope:** High-level architecture and surface security review. Per request, implementation files under `/features`, `/controllers`, `/routes`, and `/services` were not modified. Findings focus on cross-cutting infrastructure and configuration.

## Architecture Overview

- **Runtime stack:** Express server with TypeScript/ESM entry point `src/server.ts:1-166` orchestrates middleware, routing, Swagger docs, and graceful shutdown.
- **Data layer:** Sequelize connects to PostgreSQL using environment-driven config `src/config/db.ts:4-88`; migrations run through `sequelize-cli` configured in `src/config/config.cjs:1-86`.
- **Stateful helpers:** Redis client powers caching and rate-limiting stores `src/utils/redis-client.ts:5-104`; connection is optional via `REDIS_REQUIRED`.
- **Security middleware:** Helmet, xss-clean, and hpp are globally enabled before routes `src/server.ts:46-53`; centralized error handling hides stack traces in production `src/shared/middleware/error.ts:14-40`.
- **Observability:** Winston logs to rotating files plus console in non-production `src/utils/logger.ts:11-41`.

## Existing Protective Controls

- **Environment validation:** `zod` schema enforces required secrets such as `JWT_SECRET` and numeric ports `src/config/zodEnv.ts:9-75`.
- **Input hardening:** Helmet, xss-clean, hpp, and a global rate limiter are registered before routes `src/server.ts:46-65`.
- **Error hygiene:** Production responses suppress internal details `src/shared/middleware/error.ts:26-40`.
- **Operational hygiene:** Graceful shutdown closes HTTP, PostgreSQL, and Redis connections `src/server.ts:111-162`.

## Findings & Recommendations

1. **Database TLS trusts any certificate (High).** Both staging and production explicitly set `rejectUnauthorized: false` when requiring SSL `src/config/db.ts:30-57`, allowing man-in-the-middle interception. Require CA validation (set `rejectUnauthorized: true`), pin certificates, or terminate connections through a trusted proxy.
2. **Unauthenticated Swagger docs (High).** `/api/v1/docs` is always exposed with full OpenAPI output and no authentication/role checks `src/server.ts:75-79`. Gate docs behind auth, restrict by IP, or disable in production builds to prevent endpoint discovery and schema leakage.
3. **Unlimited JSON body size (Medium).** The default `express.json()` call lacks a `limit`, so large payloads can exhaust memory and bypass intended controls `src/server.ts:46-53`. Configure a sane size (e.g., `express.json({ limit: "1mb" })`) and consider compression support.
4. **Rate limiting effectively disabled outside production (Medium).** Development/test modes allow 999,999 requests per 15 minutes `src/shared/middleware/rate-limiter.ts:38-84`, and Redis is optional, so deployments that forget to flip NODE_ENV risk shipping without meaningful throttling. Use environment-specific configs but keep realistic caps and ensure Redis connectivity is required in internet-facing environments.
5. **Weak default database credentials (Medium).** `DB_USER`, `DB_PASSWORD`, and `DB_NAME` default to `postgres/password/database` `src/config/zodEnv.ts:42-75`, so a misconfigured or missing `.env` silently enables trivial credentials. Fail fast instead of defaulting, or scope defaults strictly to local development via NODE_ENV guards.
6. **Optional Redis connection can kill process (Low).** When `REDIS_REQUIRED` is false, the client never connects yet the rate limiter still instantiates a Redis store, which will fail and currently `process.exit(1)` on connection errors `src/utils/redis-client.ts:16-46`. Consider lazy stores, fallbacks, and not terminating the process for transient Redis issues.
7. **Certificate/secret sprawl risk (Low).** Two separate env-loading layers (`src/config/zodEnv.ts` and `src/config/config.cjs`) parse `.env` files differently, increasing drift risk for secrets and DB URLs. Consolidate so that operational hardening (e.g., TLS flags, credential validation) applies consistently to runtime and CLI tooling.

## Suggested Next Steps

1. Harden TLS settings for PostgreSQL and Redis in production; coordinate with infrastructure on certificate management.
2. Add authentication/authorization in front of `/api/v1/docs` or disable the route outside non-production builds.
3. Introduce request size limits and consider payload compression & monitoring.
4. Normalize environment management (single schema + required secrets) and enforce sane rate limiter defaults per environment.
