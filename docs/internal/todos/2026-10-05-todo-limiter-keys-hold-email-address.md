# Todo — two rate-limiter store keys hold an email address

- **Status:** Open (P3)
- **Created:** 2026-10-05
- **Owner:** unassigned
- **Origin:** found while fixing audit finding S8; kit
  [`log-redaction-coverage`](../initiatives/log-redaction-coverage/decisions.md) D-05

---

## What

`src/shared/middleware/rate-limiter.ts` builds two limiter keys from the address itself:
`password-reset:email:<address>` (the password-reset email limiter) and
`email-verification:email:<address>` (the email-verification email limiter). With the Redis store
the address sits in a key for the hour of the window. S8 removed the address from the log lines;
the keys were left alone because they are not log lines.

`loginLockout.ts` does not do this: its key is `auth:lockout:<hashEmail(address)>`.

## Suggested fix

Build both keys from `hashEmail` (`src/utils/email-hash.ts`). On deploy the counters under the old
keys are orphaned and expire within the hour, so every address gets one fresh window; say so in the
change. Update the key assertions in `__tests__/unit/shared/middleware/rate-limiter.test.ts`.
