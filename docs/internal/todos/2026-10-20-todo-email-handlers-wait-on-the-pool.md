# Todo — concurrent email jobs stall on the connection pool

- **Status:** Open (P1)
- **Created:** 2026-10-20
- **Owner:** unassigned
- **Origin:** dated SaaS-readiness run of 2026-10-20, finding X62
  ([`audit-2026-10-20.md`](../audits/saas-readiness/audit-2026-10-20.md) § 6)

---

## What

The verification, password-reset and invite handlers hold a transaction's connection and ask the
pool for a second: `RequestEmailVerification.issue` and `RequestPasswordReset.executeInTransaction`
call `userRepo.findById` without the transaction, and `InviteUserToOrganization.executeInTransaction`
calls `orgRepo.findById` the same way. The email is sent inside the transaction too. The pool is
Sequelize's default of five (`src/config/db.ts:75-91` sets none) and each of four consumers prefetches
ten. With five or more jobs at once, every one holds a connection and waits for another, until the
60 s acquire timeout fails them all into retry.

Reproduced on the dated run of 2026-10-20: twelve queued verification emails, five connections
`idle in transaction` for the whole wait, the first email after 61 s, seven jobs into retry.

## Suggested fix

Pass the transaction to the reads inside `runOnce`, and send after the commit or bound the send's
time inside it. Set a pool size above the consumers' combined prefetch, with an env var if it must
differ per platform (an ADR, `configuration.md`, `envManager`). A test that queues more jobs than the
pool holds.
