# Todo — two rate-limiter log lines carry an email address

- **Status:** Open (P2)
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
