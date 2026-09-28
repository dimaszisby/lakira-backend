# ADR-0036 — Production-unsafe env switches must be refused at schema layer

- **Status:** Accepted (2026-08-23)
- **Date:** 2026-06-05
- **Related:** Open finding — see `docs/internal/audits/saas-readiness/audit-2026-06-05.md`.
- **Origin:** `ADR-010` in the SaaS readiness audit kit — [`saas-readiness`](../../internal/audits/saas-readiness/decisions.md)

---

## Context

The 2026-06-05 re-audit (`audit-2026-06-05.md` §6.2 F1) flagged that `DISABLE_RATE_LIMITING` (a global killswitch for every rate limiter — global, user, analytics, switch-org, password-reset, email-verify) is parsed as a plain boolean with `.default("false")` at `src/config/zodEnv.ts:188–191`. There is **no validation that rejects `true` when `NODE_ENV=production`**. The rule is documented as "test/fuzzing only" in `.claude/rules/security.md`, but the rules-as-convention enforcement is purely advisory: a misconfigured production deploy (fat-finger, CI copying a test `.env`, a forker who didn't clean their `.env`) silently disables every rate limiter, and the only signal is a single `logger.info` line at process start (`src/shared/middleware/rate-limiter.ts:10`) that log monitoring may miss.

## Decision

Any environment variable whose `true` value would weaken a production security control MUST refuse that combination at the Zod schema layer via `.superRefine()`, causing `loadEnvOrExit()` to fail fast at process start. The minimum enforcement set for this codebase:

| Env var                  | Refused-in-production combination                                        |
| ------------------------ | ------------------------------------------------------------------------ |
| `DISABLE_RATE_LIMITING`  | `true` when `NODE_ENV=production`                                        |
| `ALLOW_TEST_HTTP_SERVER` | `true` when `NODE_ENV=production`                                        |
| `RABBITMQ_USER`          | `"guest"` when `NODE_ENV=production` and `RABBITMQ_ENABLED`              |
| `RABBITMQ_PASSWORD`      | `"guest"` when `NODE_ENV=production` and `RABBITMQ_ENABLED`              |
| `SWAGGER_REQUIRE_AUTH`   | `false` when `NODE_ENV=production` (already conventionally true; codify) |
| `SKIP_DB_LIFECYCLE`      | `true` when `NODE_ENV=production` (added 2026-08-24; twelve-factor TF-6) |

## Options considered

- _Documentation-only enforcement (status quo)._ Rejected — this audit caught a real instance; "documented as test-only" is not a safety property.
- _Runtime assertion in the consuming module (e.g., `rate-limiter.ts`)._ Considered. The schema layer is preferred because it short-circuits the boot sequence consistently with `loadEnvOrExit()`'s fail-fast contract; runtime guards run later and can be bypassed by code that bypasses the singleton.
- _Whitelist approach (every env switch must be explicitly safe-in-prod)._ Considered. Overkill at this scale; the named-bad list is more maintainable. Re-visit if the env schema doubles in size.

## Consequences

- Process refuses to start in `NODE_ENV=production` if any of the listed combinations are set. Failure surface is the startup logger error message, which is monitored.
- Test envs continue to work unchanged — only `NODE_ENV=production` triggers the refusal.
- Future security-relevant switches added to `zodEnv.ts` MUST be considered against this rule (a comment in the schema referencing this ADR will be added).

## Links

- `audit-2026-06-05.md` §6.2 (F1), §6.3 (F3)
- `src/config/zodEnv.ts:188–191` (the unguarded `DISABLE_RATE_LIMITING`)
- `src/config/zodEnv.ts:193–196` (`ALLOW_TEST_HTTP_SERVER`)
- `src/config/zodEnv.ts:215–216` (RabbitMQ guest defaults)
- `.claude/rules/security.md` (which will reference this ADR)

---

> **2026-09-26:** [ADR-0048](./adr-0048-mailpit-for-local-outbound-email.md) adds
> `EMAIL_PROVIDER=mailpit` to the refused set. The table above is the original set; the live list
> is the `superRefine` block in `src/config/zodEnv.ts`, which also refuses `LOG_LEVEL=silly`.

> **2026-09-27:** [ADR-0049](./adr-0049-console-email-adapter-confined-to-dev-and-test.md) adds
> `EMAIL_PROVIDER=console`, refused unless `NODE_ENV` is `development` or `test`. It is the first
> entry that also applies in staging.

> **2026-09-28:** every refusal here is keyed on `NODE_ENV`. The production image now defaults it to
> `production` ([ADR-0050](./adr-0050-production-image-defaults-node-env.md)), so the refusals hold
> even when a deployer sets nothing.
