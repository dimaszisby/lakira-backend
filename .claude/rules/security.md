# Security

## Global Middleware Stack

Applied in this order by `mountHttpPipeline` (`src/shared/middleware/http-pipeline.ts`), which
`src/server.ts` calls once before it registers anything else (ADR-0061):

1. `requestIdMiddleware` — AsyncLocalStorage correlation id (ADR-0027). An incoming
   `x-request-id` is used only when it is 1 to 64 characters of `[A-Za-z0-9._-]`; anything else
   is replaced by a minted UUID
2. `accessLogMiddleware` — one line per request
3. `helmet()` — secure HTTP headers
4. HTTPS redirect — production only
5. `disallowTraceMethod` — blocks TRACE requests
6. `cors` — `CORS_ORIGIN` allowlist; ahead of the limiter so a browser can read a 429
7. `/api/v1/health` and `/api/v1/ready` — ahead of the limiter, so a platform probe is never
   throttled, and ahead of the parsers, so a probe reads no body. `/ready` runs its database and
   Redis checks at most once per 2 s window (`src/shared/utils/readiness-probe.ts`); a new check
   added to it goes through that probe
8. `globalRateLimiter` — the only app-wide limiter; the rest are attached per route
9. `express.json()` — body parsing. **Nothing above this line reads a request body**: a request
   is counted before it is parsed
10. `cookie-parser` — needed for the refresh-token cookie
11. `xss-clean` — sanitize request payloads
12. `hpp()` — prevent HTTP parameter pollution

A new global middleware is added in `mountHttpPipeline` and nowhere else; one that reads the body
goes below the limiter. No other file under `src/` imports a body or cookie parser, `helmet`,
`hpp`, `xss-clean` or `cors`, and `architecture.test.ts` fails on one that does.

## Rate Limiting

App-wide:

- **Global**: 100 req / 15 min (IP-based), `RATE_LIMIT_GLOBAL_MAX`

Per route (`src/shared/middleware/rate-limiter.ts`):

- **User**: 50 req / 15 min (user ID or IP fallback), `RATE_LIMIT_USER_MAX`
- **Analytics**: 30 req / 1 min (user ID or IP fallback), `RATE_LIMIT_ANALYTICS_MAX`
- **Switch org**: per 15 min, `RATE_LIMIT_SWITCH_ORG_MAX`
- **Registration**: per hour, per client IP, first in the `POST /auth/register` chain,
  `RATE_LIMIT_REGISTER_IP_MAX` (ADR-0053)
- **Password reset** and **email verification**: per hour, each keyed both by email and by IP
  (`RATE_LIMIT_PASSWORD_RESET_{EMAIL,IP}_MAX`, `RATE_LIMIT_EMAIL_VERIFICATION_{EMAIL,IP}_MAX`)

Every key built from the client's address goes through `clientIpKey`: IPv4 whole, an IPv6 client
by its /64, and `::ffff:a.b.c.d` as IPv4 (ADR-0063). `architecture.test.ts` fails on a limiter
that keys on the raw `req.ip` or sets no `keyGenerator`. `req.ip` itself comes from `TRUST_PROXY`,
a whole number of hops (default 1; blank, negative or fractional is refused at startup), and the
server logs the value in use once it listens.

Store: in-memory under `NODE_ENV=test`; everywhere else Redis. Outside tests the in-memory store is
used only when `REDIS_REQUIRED=false` **and** Redis is not connected — it then logs a warning,
and limits stop being shared across instances (twelve-factor TF-12).

- `DISABLE_RATE_LIMITING=true` disables all limiters (test/fuzzing only). Startup refuses it
  when `NODE_ENV=production` — see ADR-0036 for the full refused set.

## Authentication Flow

1. Client sends `Authorization: Bearer <JWT>` header (a short-lived access token; the refresh
   token travels separately, as an httpOnly cookie scoped to `/api/v1/auth/refresh`)
2. `authMiddleware` validates the token via the `TokenProvider` port
3. The token must carry an organization claim, and the user must hold an active membership in
   that organization — otherwise 401
4. Sets `req.user`, `req.organizationId` and `req.membership`
5. Protected routes use `assertAuthenticated(req)` to narrow the type; role checks use
   `requireOrgRole` / `assertHasOrgRole`

## Sensitive Data Handling

- A `pre-commit` hook refuses any staged `.env*` path other than `*.example`. It inspects the
  **staged set**, so it holds however the files were added. Bypass with `git commit --no-verify`
  only when the file genuinely belongs in the repo.

- Env vars and log metadata whose **key** matches
  `/password|secret|authorization|cookie|bearer|(token|key|certificate|url|dsn)$/i` are masked as
  `***REDACTED***`. The first five terms match anywhere in the key (so `passwordHash` and
  `set-cookie` are caught); the rest are suffix-anchored. Single source:
  `src/config/sensitive-keys.ts`
- The logger masks metadata before it formats the message, so a `%j` or `%o` token prints the
  masked copy. Metadata nested deeper than five levels is written as `[Truncated]`, never passed
  through (ADR-0059)
- Everything Sentry would send passes through `src/utils/sentry-scrub.ts` first: events through
  `scrubSentryEvent`, transactions, spans and logs through their own hooks, since none reaches
  `beforeSend`. `Sentry.init` spreads `SENTRY_SCRUB_HOOKS`, so a new hook goes in that object; a
  test runs it through the real SDK. Logs are off, and their hook is set anyway. The scrubber
  masks credential headers, drops cookies, and applies the key pattern to the body, `extra`,
  `contexts`, `tags`, breadcrumb data, span and log attributes. It cuts the query string and the
  `user:password@` from the request URL and from any URL in a header, a breadcrumb or a span,
  reduces `user` to its id, and drops the client address. A network address is judged by its
  value, not its name: an attribute holding one is dropped, and in free text, in a URL's host and
  in a context it becomes `[address]`. Free text (exception messages, the transaction name,
  `logentry`, breadcrumbs) loses email addresses, JWTs, bearer tokens, query strings and the
  userinfo of a URL of any scheme by pattern; it does **not** lose a name or any other detail a
  message holds, so do not put one in an error message. A database span keeps its operation and
  never its statement
- Never log passwords, tokens, or PII
- Redaction is by key and does not scan message text, so nothing personal is ever interpolated
  into a log message. Name a person by user id; where there is no user, name an email address by
  `hashEmail` (`src/utils/email-hash.ts`), as the login lockout and the rate limiters do. The
  limiter lines carry a user id, an IP, or that hash, and a test trips every limiter to prove it
- A cache key is never written to a log either: a cursor key holds the user's search text. Name the
  entry with `cacheEntryName(key)` (`src/utils/cache-entry-name.ts`), which gives its namespace and
  a short hash, and log how many keys an invalidation deleted, not which
- A line about a rejected request says which field and which rule, not what was sent. A failed
  validation is logged through `describeZodIssues` (field and Zod issue code); Zod's messages, which
  repeat the input, go to the client only. A parser or routing error is logged by its `type`
- A startup error about a connection URL names the variable and the reason, never the URL: it is
  printed by `console.error` and again by Node, and neither is redacted. `DB_LOGGING=true` writes
  SQL with the values of its `WHERE` clauses, so startup refuses it when `NODE_ENV=production`
  (ADR-0036); it is for a developer's own machine
- An error may be passed to the logger: it is reduced to an allowlist of its fields before anything
  is written (`name`, `code`, `statusCode` and the like, plus `db.code`, `db.constraint`,
  `db.table`), so a database error's SQL and bound values never reach the log (ADR-0059). That
  holds wherever the error sits: as an argument, or nested in a metadata object or an array. Do not
  attach context to an error to get it logged; pass it by name in a metadata object
- `EMAIL_PROVIDER=console` logs every email body, tokens included. Startup refuses it unless
  `NODE_ENV` is `development` or `test` (ADR-0049). Email adapters never log the recipient.
- `EMAIL_PROVIDER=mailpit` sends every email, tokens included, to a local catcher. Startup
  refuses it when `NODE_ENV=production` (ADR-0048); staging may use it.
- Passwords hashed with bcrypt via `PasswordHasher` port

## Security CI Pipeline

- `npm run test:unit:security-framework` — framework validation tests
- `npm run security:delta:check` — dependency vulnerability delta analysis
- `npm run security:gate:evaluate` — evaluates the gate policy. "Soft" means only
  Critical/High findings trip it, **not** that it is non-blocking: the `Security Delta
Checks` job re-raises a failed gate (`exit 1`), and `Unit & Integration Tests` +
  `contract_local` both depend on that job, so a tripped gate stops the pipeline.
- Security framework + gate policy: `docs/reference/security/`
- Dated audit runs: `docs/internal/audits/security/`
- Release SOP: `docs/how-to/security/release-delta-sop.md`
