# Configuration

Every environment variable is declared in the Zod schema in `src/config/zodEnv.ts` and read
through `loadEnvOrExit()` in `src/config/envManager.ts`.

Three properties follow from that:

- **Validated at boot.** An invalid or missing required variable crashes the process
  immediately with a field-level error, rather than failing later at first use.
- **Read once.** The parsed object is cached; changing `process.env` after boot has no effect.
  Tests call `resetEnvCacheForTesting()` to clear it.
- **Never read directly.** Application code uses `env.X`, never `process.env.X`. This is a
  convention, not a lint rule: ESLint bans `process.env` only in `__tests__/**` (use `withTestEnv`
  there). The known exceptions in `src/` are `src/config/app-name.ts` and `src/utils/logger.ts`,
  which load before `envManager` and so cannot use it.

**Two things have no default: `JWT_SECRET`, and a database connection.** The database needs
either a `DATABASE_URL` (or its per-environment variant) or all of `DB_USER`, `DB_PASSWORD` and
`DB_NAME`; startup throws otherwise. Everything else boots on its default.

Copy `.env.example` to `.env` to begin. Adding a variable means adding it to `zodEnv.ts` first —
the schema is the source of truth, and this page is derived from it.

## Secret redaction

Any variable whose name matches `SENSITIVE_KEY_PATTERN` (`src/config/sensitive-keys.ts`) is written
to logs as `***REDACTED***`. That module is the single source of truth — read it rather than
trusting a copy, because every restatement of this pattern has drifted.

Two matching styles: `password`, `secret`, `authorization`, `cookie` and `bearer` match **anywhere**
in the name, while `token`, `key`, `certificate`, `url` and `dsn` must be the **suffix**. So
`RESEND_API_KEY`, `DATABASE_URL` and `SENTRY_DSN` are masked while `EMAIL_FROM` is not. Name new
secrets to end in one of the suffix words, or add a term to that module.

---

## Core

| Variable                 | Type                                                 | Default                                                          |
| ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`               | `development` \| `test` \| `staging` \| `production` | `development`; the production image sets `production` (ADR-0050) |
| `PORT`                   | number                                               | `5000`                                                           |
| `JWT_SECRET`             | string                                               | **required**                                                     |
| `ACCESS_TOKEN_TTL_SEC`   | number                                               | `900` (15 min)                                                   |
| `REFRESH_TOKEN_TTL_DAYS` | number                                               | `30`                                                             |
| `CORS_ORIGIN`            | string                                               | optional — comma-separated allowlist                             |
| `TRUST_PROXY`            | number                                               | optional — hops to trust behind a load balancer                  |
| `REQUEST_BODY_LIMIT`     | string                                               | `1mb`                                                            |
| `DEFAULT_TZ`             | string                                               | `Asia/Jakarta`                                                   |

## Database

Give **either** a connection URL **or** the discrete parts. URLs win when both are present, and
the per-environment URL is selected by `NODE_ENV`.

| Variable                                                                                              | Type    | Default                                      |
| ----------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------- |
| `DATABASE_URL`                                                                                        | string  | optional                                     |
| `DEVELOPMENT_DATABASE_URL` / `TEST_DATABASE_URL` / `STAGING_DATABASE_URL` / `PRODUCTION_DATABASE_URL` | string  | optional                                     |
| `DB_HOST`                                                                                             | string  | `db` under `NODE_ENV=test`, else `127.0.0.1` |
| `DB_PORT`                                                                                             | number  | `5432`                                       |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME`                                                                 | string  | optional                                     |
| `DB_LOGGING`                                                                                          | boolean | `false`                                      |
| `LOG_LEVEL`                                                                                           | enum    | `http` in production, else `debug`           |
| `SKIP_DB_LIFECYCLE`                                                                                   | boolean | `false`                                      |
| `DB_SSL_REJECT_UNAUTHORIZED`                                                                          | boolean | `true` in production, else `false`           |

> `LOG_LEVEL` is one of `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`; each level
> includes the ones above it. Production defaults to `http` rather than `info` so the HTTP
> access-log lines are included — at `info` they would be silently dropped. `silly` is **refused**
> in production (ADR-0036). `DB_LOGGING=true` routes SQL through `logger.debug`, so it only
> produces output when `LOG_LEVEL` is `debug` or lower.
>
> Logs go to **stdout only**; the app writes no log files (ADR-0041). Access-log lines carry the
> request path with the query string stripped — redaction covers log metadata, not URL strings or
> message text, so no message carries an email address (a limiter names a user id, an IP or a hash).
> See [`../how-to/development/read-application-logs.md`](../how-to/development/read-application-logs.md).

> `DB_HOST` defaulting to `db` in test targets the Docker Compose service name. Running tests on
> the host instead requires `DB_HOST=127.0.0.1`.

## Redis

| Variable                   | Type    | Default                                         |
| -------------------------- | ------- | ----------------------------------------------- |
| `REDIS_URL`                | string  | optional                                        |
| `REDIS_HOST`               | string  | `redis` under `NODE_ENV=test`, else `127.0.0.1` |
| `REDIS_PORT`               | number  | `6379`                                          |
| `REDIS_PASSWORD`           | string  | optional                                        |
| `REDIS_REQUIRED`           | boolean | `false` in test, else `true`                    |
| `ENABLE_REDIS_INTEGRATION` | boolean | `false`                                         |

`REDIS_REQUIRED=true` means "the app cannot serve correctly without Redis", **not** "exit on the
first error". A lost connection is retried with backoff for about **30 seconds** (35 attempts,
`min(retries * 50, 2000)` ms apart); only if that budget is exhausted does the process log the
reason and exit `1`, so the platform restarts it. A Redis restart or a cold start reconnects
without dropping the process.

With `REDIS_REQUIRED=false` the app degrades instead: it logs and continues after the same retry
budget, caching is skipped, and rate limiting falls back to an **in-memory, per-instance** store —
which is weaker than it sounds in a multi-instance deployment, so treat `false` as a temporary
measure rather than a setting.

## RabbitMQ

Disabled by default; the app substitutes a no-op queue so nothing else has to change.

| Variable                              | Type    | Default                                 |
| ------------------------------------- | ------- | --------------------------------------- |
| `RABBITMQ_ENABLED`                    | boolean | `false`                                 |
| `RABBITMQ_URL`                        | string  | optional (overrides the discrete parts) |
| `RABBITMQ_HOST`                       | string  | `127.0.0.1`                             |
| `RABBITMQ_PORT`                       | number  | `5672`                                  |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | string  | `guest` / `guest`                       |
| `RABBITMQ_VHOST`                      | string  | `/`                                     |
| `RABBITMQ_PREFETCH`                   | number  | `10`                                    |
| `RABBITMQ_MAX_RETRIES`                | number  | `5`                                     |
| `RABBITMQ_RETRY_BASE_DELAY_MS`        | number  | `2000`                                  |

A failed job is retried up to `RABBITMQ_MAX_RETRIES` times, waiting `RABBITMQ_RETRY_BASE_DELAY_MS`
before the first retry and doubling each time (capped at 5 minutes), then parked. `0` parks on the
first failure. See [ADR-0005](../explanation/decisions/adr-0005-topic-exchange-with-parking-lot-dlx.md).

`src/worker.ts` consumes the queue and exits at startup unless `RABBITMQ_ENABLED=true`. Locally
it is an opt-in Compose service (`docker compose --profile worker up -d`) that sets the flag in its
own `environment:`, so the `app` service keeps the synchronous fallback. Only the worker enables
the queue.

The integration suite needs a reachable broker at the default address even though
`RABBITMQ_ENABLED` stays `false`. The queued-path test runs the consumer in-process and turns
the queue on for itself. CI supplies RabbitMQ as a service container. Locally, stop the Compose
worker before `npm test`, because it would consume the test's messages.

## Rate limiting

| Variable                                  | Type    | Default | Window           |
| ----------------------------------------- | ------- | ------- | ---------------- |
| `RATE_LIMIT_GLOBAL_MAX`                   | number  | `100`   | 15 min, per IP   |
| `RATE_LIMIT_USER_MAX`                     | number  | `50`    | 15 min, per user |
| `RATE_LIMIT_ANALYTICS_MAX`                | number  | `30`    | 1 min            |
| `RATE_LIMIT_SWITCH_ORG_MAX`               | number  | `10`    | 15 min           |
| `RATE_LIMIT_EMAIL_VERIFICATION_EMAIL_MAX` | number  | `3`     | per email        |
| `RATE_LIMIT_EMAIL_VERIFICATION_IP_MAX`    | number  | `10`    | per IP           |
| `RATE_LIMIT_PASSWORD_RESET_EMAIL_MAX`     | number  | `3`     | per email        |
| `RATE_LIMIT_PASSWORD_RESET_IP_MAX`        | number  | `10`    | per IP           |
| `RATE_LIMIT_REGISTER_IP_MAX`              | number  | `10`    | 1 h, per IP      |
| `DISABLE_RATE_LIMITING`                   | boolean | `false` |                  |

> `RATE_LIMIT_REGISTER_IP_MAX` bounds `POST /auth/register` per client IP (ADR-0053). Every per-IP
> limit is only as good as `req.ip`, which depends on `TRUST_PROXY` matching the real number of
> proxies in front of the app; see the ADR's consequences.

> `DISABLE_RATE_LIMITING=true` turns off **every** limiter. It exists for test and fuzzing
> runs. Startup **refuses** it when `NODE_ENV=production`, along with the other
> production-unsafe switches listed in
> [ADR-0036](../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md):
> `ALLOW_TEST_HTTP_SERVER=true`, `SWAGGER_REQUIRE_AUTH=false`, `SKIP_DB_LIFECYCLE=true`,
> `LOG_LEVEL=silly`, `EMAIL_PROVIDER=mailpit` (ADR-0048), `EMAIL_PROVIDER=console` (ADR-0049; refused in staging too), and default `guest` RabbitMQ credentials when `RABBITMQ_ENABLED=true`. The process exits before binding a
> listener and logs a structured `[ENV_ERROR]` line naming the offending variable.

## Email

| Variable                     | Type                               | Default                                                   |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `EMAIL_PROVIDER`             | `console` \| `resend` \| `mailpit` | `console` in development/test, else `resend`              |
| `RESEND_API_KEY`             | string                             | optional — required when provider is `resend`             |
| `MAILPIT_URL`                | URL                                | `http://localhost:8025` — used when provider is `mailpit` |
| `EMAIL_FROM`                 | string                             | `onboarding@resend.dev`                                   |
| `FRONTEND_RESET_URL`         | string                             | `http://localhost:3000/reset-password`                    |
| `FRONTEND_VERIFY_URL`        | string                             | `http://localhost:3000/verify-email`                      |
| `FRONTEND_INVITE_URL`        | string                             | `http://localhost:3000/invites/accept`                    |
| `EMAIL_VERIFICATION_TTL_SEC` | number                             | `86400` (24 h)                                            |
| `INVITE_TOKEN_TTL_DAYS`      | number                             | `7`                                                       |

The provider is chosen by `EMAIL_PROVIDER`, not by `NODE_ENV`, so a staging environment can send
real mail without pretending to be production. The `console` adapter logs the message, body and
recipient included, instead of sending it. Because the body carries verify, reset and invite
tokens, `console` is **refused unless `NODE_ENV` is `development` or `test`**
([ADR-0049](../explanation/decisions/adr-0049-console-email-adapter-confined-to-dev-and-test.md)).
The development log format drops the body anyway, so use `mailpit` to read tokens. The Resend
adapter logs only the subject and error when a send fails, never the recipient.

`mailpit` delivers every email to a local [Mailpit](https://mailpit.axllent.org) catcher through
its HTTP API, so tokens can be read in its inbox or from a test
([`../how-to/development/read-outbound-email.md`](../how-to/development/read-outbound-email.md)).
It is refused when `NODE_ENV=production` and allowed in staging for the VPS stack
([ADR-0048](../explanation/decisions/adr-0048-mailpit-for-local-outbound-email.md)). The Compose
`app` service always uses it. `MAILPIT_URL` ends in `url`, so it is masked in environment dumps
like every other URL.

## Analytics & visualization

| Variable                     | Type   | Default |
| ---------------------------- | ------ | ------- |
| `VIZ_MAX_BUCKETS`            | number | `400`   |
| `VIZ_DASH_MAX_METRICS`       | number | `24`    |
| `VIZ_DEFAULT_TTL_SEC`        | number | `120`   |
| `VIZ_FALLBACK_GUARD_BUCKETS` | number | `96`    |

## Observability & operations

| Variable                    | Type    | Default                                         |
| --------------------------- | ------- | ----------------------------------------------- |
| `SENTRY_DSN`                | string  | optional — Sentry is off when unset             |
| `SENTRY_TRACES_SAMPLE_RATE` | number  | `0`                                             |
| `APP_RELEASE`               | string  | `"unknown"` (falls back to `RENDER_GIT_COMMIT`) |
| `SWAGGER_REQUIRE_AUTH`      | boolean | `true`                                          |
| `ENABLE_DUMMY_ENDPOINTS`    | boolean | `true` in development/test, else `false`        |
| `ALLOW_TEST_HTTP_SERVER`    | boolean | `false`                                         |
| `JEST_TIMEOUT`              | number  | `30000`                                         |

## Branding

| Variable   | Type   | Default                              |
| ---------- | ------ | ------------------------------------ |
| `APP_NAME` | string | the `name` in the app's package.json |

`APP_NAME` drives the API title, the refresh cookie's name, email copy, log service name, and
queue names. You do not have to set it: with the variable unset or blank, the app is named after
its own package, which `scripts/bootstrap-fork.sh` renames for a fork
([ADR-0060](../explanation/decisions/adr-0060-the-app-takes-its-name-from-its-package.md)). The
image carries `package.json`, so a deployed fork is named after the fork with no platform variable.
Set `APP_NAME` only to run under a different name than the package's; a set value always wins, and
nothing checks it against the package.

The package it reads is the nearest `package.json` at or above the entry script (`dist/server.js`,
`dist/worker.js`), or the one in the working directory when there is no entry script outside
`node_modules`, as under test. With no variable and no package name to read, the app refuses to
start and the error says where it looked.

The **committed** OpenAPI spec file always takes its names from the package name, whatever the
variable says, so that the drift gate cannot depend on a shell or an `.env`
(`scripts/openapi-app-name.js`). The spec served at `/api/v1/docs/openapi.json` follows the runtime
name. If you set `APP_NAME` to something other than the package name, the served spec and the
committed file describe different names.

**This is the one variable not in the Zod schema.** `src/config/app-name.ts` reads
`process.env.APP_NAME` directly, because `logger.ts` imports it at module load and routing it
through the validated env object would create a circular initialisation failure. The bypass is
deliberate and commented at the source. Two names
are derived from it: `APP_SHORT_NAME` (strips a trailing `-backend`) and `APP_DISPLAY_NAME`
(title-cased).
