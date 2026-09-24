# Security

## Global Middleware Stack

Applied in this order in `src/server.ts`:

1. `express.json()` — body parsing
2. `cookie-parser` — needed for the refresh-token cookie
3. `requestIdMiddleware` — AsyncLocalStorage correlation id (ADR-0027)
4. `accessLogMiddleware` — one line per request
5. `helmet()` — secure HTTP headers
6. HTTPS redirect — production only
7. `xss-clean` — sanitize request payloads
8. `hpp()` — prevent HTTP parameter pollution
9. `disallowTraceMethod` — blocks TRACE requests
10. `cors` — `CORS_ORIGIN` allowlist
11. `/api/v1/health` and `/api/v1/ready` — mounted here, before rate limiting
12. `globalRateLimiter` — the only app-wide limiter; the rest are attached per route

## Rate Limiting

App-wide:

- **Global**: 100 req / 15 min (IP-based), `RATE_LIMIT_GLOBAL_MAX`

Per route (`src/shared/middleware/rate-limiter.ts`):

- **User**: 50 req / 15 min (user ID or IP fallback), `RATE_LIMIT_USER_MAX`
- **Analytics**: 30 req / 1 min (user ID or IP fallback), `RATE_LIMIT_ANALYTICS_MAX`
- **Switch org**: per 15 min, `RATE_LIMIT_SWITCH_ORG_MAX`
- **Password reset** and **email verification**: per hour, each keyed both by email and by IP
  (`RATE_LIMIT_PASSWORD_RESET_{EMAIL,IP}_MAX`, `RATE_LIMIT_EMAIL_VERIFICATION_{EMAIL,IP}_MAX`)

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
- Sentry events pass through `scrubSentryEvent` (`src/utils/sentry-scrub.ts`) before egress, which
  redacts credential headers, drops cookies, and applies the same pattern to the body, `extra` and
  `contexts`
- Never log passwords, tokens, or PII
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
