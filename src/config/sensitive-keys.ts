/**
 * Keys whose values are masked as `***REDACTED***` in logs, by both
 * `src/utils/logger.ts` (log metadata) and `src/config/envManager.ts` (env values).
 *
 * Two anchoring styles, deliberately:
 *
 * - **Unanchored** — `password`, `secret`, `authorization`, `cookie`, `bearer`. These appear as
 *   whole keys, as prefixes (`passwordHash`, `passwordConfirmation`) and inside header names
 *   (`set-cookie`). Anchoring them to the end missed all of those.
 * - **Suffix-anchored** — `token`, `key`, `certificate`, `url`, `dsn`. Unanchoring these would
 *   match `keyword`, `sortKey` and similar, stripping context that is not sensitive.
 *
 * `dsn` is here because `SENTRY_DSN` matched nothing else — it ends in "DSN" — and a Sentry DSN
 * is a write credential: anyone holding it can post events into the project.
 *
 * `hash` is deliberately absent: it would catch `passwordHash`, but also `etagHash` and every
 * other digest field, and this codebase has live ETag logic worth being able to debug. Unanchoring
 * `password` covers `passwordHash` without that cost. See
 * `docs/internal/initiatives/log-redaction-coverage/decisions.md` D-01.
 */
export const SENSITIVE_KEY_PATTERN =
  /password|secret|authorization|cookie|bearer|(token|key|certificate|url|dsn)$/i;
