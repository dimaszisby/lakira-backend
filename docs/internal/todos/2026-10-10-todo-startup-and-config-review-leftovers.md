# Todo — what the review of the startup-URL and `DB_LOGGING` fixes left open

- **Status:** Closed (all P3), on `fix/startup-config-leftovers`
  ([`log-redaction-coverage` D-17](../initiatives/log-redaction-coverage/decisions.md)). Each
  item's outcome is under Resolution
- **Created:** 2026-10-10
- **Owner:** unassigned
- **Origin:** the security review of `fix/c6-startup-url-db-logging`
  ([`log-redaction-coverage` D-10 and D-11](../initiatives/log-redaction-coverage/decisions.md)).
  None is one of the routes caveat C6 closes on (ADR-012 of the audit folder), so each is a
  finding in its own right

All read in the code by the reviewer and not reproduced.

## Items

- **`NODE_ENV=Production` and three defaults.** The schema lowercases `NODE_ENV` and refuses the
  unsafe switches, but the defaults of `LOG_LEVEL`, `DB_SSL_REJECT_UNAUTHORIZED` and
  `ENABLE_DUMMY_ENDPOINTS` compare the raw `process.env.NODE_ENV` with `"production"`. With a
  capitalised value they take their non-production defaults: `LOG_LEVEL=debug`, and certificate
  checking off. Worth reproducing first; if it holds it is the most serious item here.
- **Development migrations log SQL.** `src/config/config.cjs` sets `logging: console.log` for
  development, and sequelize-cli falls to development when `NODE_ENV` is unset. Migration SQL is
  static text, so the exposure is small.
- **RabbitMQ credentials are not URL-encoded.** `buildAmqpUrl` in `RabbitMQConnection.ts`
  interpolates the user and password as they are, so a password with `@` or `/` builds a wrong
  URL. A correctness defect, not a leak.
- **Third-party messages on the startup path.** Whether an amqplib connection error or the Sentry
  SDK's complaint about a bad DSN quotes the URL or the DSN was not established.
- **Tests not written.** The `DATABASE_URL` fallback's variable name has no case, because the test
  helper cannot unset a variable (it assigns the string `"undefined"`). Nothing asserts directly
  that production starts with `DB_LOGGING` unset.
- **Dead branches.** The three `Number.isNaN` port checks in `zodEnv.ts` cannot be reached:
  `new URL` rejects a non-numeric port first. The `PORT` transform's error says `REDIS_PORT`.

## Resolution

- **`NODE_ENV=Production`:** reproduced. Against the build on `dev`, it gave
  `DB_SSL_REJECT_UNAUTHORIZED=false` and `LOG_LEVEL=debug`; the logger itself already used `http`.
  The schema is now built from the lowercased value, at parse time, and a test covers three spellings.
  Seven defaults read it, not three; the other four were wrong only harmlessly.
- **Development migrations:** print SQL only with `DB_LOGGING=true`.
- **RabbitMQ credentials:** `buildAmqpUrl` encodes the user and password.
- **Third-party messages:** amqplib's errors quote no URL; `@sentry/core` prints a DSN it cannot
  parse in full. A malformed `SENTRY_DSN` is now refused at startup, by name.
- **Tests:** `withTestEnv` now unsets a variable whose override is `undefined`; the
  `DATABASE_URL` fallback and production's `DB_LOGGING` default each have a case.
- **Dead branches:** removed; the `PORT` error says `PORT`.
