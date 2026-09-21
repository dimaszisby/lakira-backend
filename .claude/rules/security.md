# Security

## Global Middleware Stack

Applied in order on every request:

1. `helmet()` — secure HTTP headers
2. `xss-clean` — sanitize request payloads
3. `hpp()` — prevent HTTP parameter pollution
4. `disallowTraceMethod` — blocks TRACE requests
5. Rate limiters (global, user, analytics)

## Rate Limiting

- **Global**: 100 req / 15 min (IP-based)
- **User**: 50 req / 15 min (user ID or IP fallback)
- **Analytics**: 30 req / 1 min (user ID or IP fallback)
- Store: Redis in production, in-memory fallback in dev/test
- `DISABLE_RATE_LIMITING=true` disables all limiters (test/fuzzing only). Startup refuses it
  when `NODE_ENV=production` — see ADR-0036 for the full refused set.

## Authentication Flow

1. Client sends `Authorization: Bearer <JWT>` header
2. `authMiddleware` validates token via `TokenProvider` port
3. Loads user from `UserRepository`, sets `req.user`
4. Protected routes use `assertAuthenticated(req)` to narrow type

## Sensitive Data Handling

- A `pre-commit` hook refuses any staged `.env*` path other than `*.example`. It inspects the
  **staged set**, so it holds however the files were added. Bypass with `git commit --no-verify`
  only when the file genuinely belongs in the repo.

- Env vars and log metadata whose **key** matches
  `/password|secret|authorization|cookie|bearer|(token|key|certificate|url)$/i` are masked as
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
