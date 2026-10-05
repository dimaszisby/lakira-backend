# Todo — two rate-limiter log lines carry an email address

- **Status:** Fixed (Micro; kit
  [`log-redaction-coverage`](../initiatives/log-redaction-coverage/decisions.md) D-05; commits
  carry `refs: limiter-logs-email-address`). The verification limiter logs the user id and the
  password-reset limiter logs a hash of the address. S8 stays open in the audit until a dated run
  confirms it (ADR-002). The limiter store keys are a separate matter:
  [`2026-10-05-todo-limiter-keys-hold-email-address.md`](2026-10-05-todo-limiter-keys-hold-email-address.md)
- **Created:** 2026-10-03
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 6, S8

---

## What

`src/shared/middleware/rate-limiter.ts:168` logs the email submitted to password reset, and `:214`
logs `req.user.email` for the email-verification limiter. `.claude/rules/security.md` says never to
log PII, and redaction is by metadata key, so message text gets through. Both lines predate
ADR-0057, which kept every log line as it was.

## Suggested fix

Log a hash, as `loginLockout.ts:64` does with `emailHash`, or the user id where there is one.
Update the expected log lines in `rate-limiter.envelope.test.ts`.
