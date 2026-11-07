# ADR-0077 — A queued job holds one connection, for a bounded time

- **Status:** Accepted
- **Date:** 2026-10-21
- **Related:** [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md) (the dedup row and
  the work share one transaction); [ADR-0067](./adr-0067-the-verification-email-is-a-queued-job.md),
  [ADR-0069](./adr-0069-the-password-reset-email-is-a-queued-job.md) and
  [ADR-0070](./adr-0070-the-invite-email-is-a-queued-job.md) (the three queued emails, each sent inside
  its job's transaction)
- **Origin:** `D-02` and `D-03` in the worker-cancel-and-one-connection-per-job kit —
  [`worker-cancel-and-one-connection-per-job`](../../internal/initiatives/worker-cancel-and-one-connection-per-job/decisions.md);
  register row B-75 (finding X62 of the dated run of 2026-10-20)

---

## Context

`runOnce` (`SequelizeMessageIdempotency`) runs a job's work inside one transaction, so the dedup row
and the work commit or roll back together. A transaction holds one pooled connection for its whole
life. Checked on `dev` at `b3054cb`:

- Inside that transaction, the verification and password-reset paths read the user with
  `userRepo.findById(userId)`, and the invite path reads the organization with
  `orgRepo.findById(...)`, all without the transaction, so each asked the pool for a second
  connection. `UserRepository.findById` and `OrganizationRepository.findById` took no transaction.
- The pool is Sequelize's default of five, and each of four consumers prefetches ten. Five
  concurrent jobs held all five connections, and each waited for a sixth until the 60 s acquire
  timeout failed them into retry. The dated run reproduced it: twelve queued emails, five connections
  `idle in transaction`, the first email after 61 s, seven jobs into retry.
- The email is sent inside the transaction on purpose: sent after the commit, a failed send would
  leave the dedup row committed, and the retry would be read as a duplicate and lose the email.
  Neither sender had a timeout, so a provider that hung held the connection for as long as it hung.

## Decision

1. **Work handed to `runOnce` makes every database call through the transaction it receives.**
   `UserRepository.findById(id, tx?)` and `OrganizationRepository.findById(id, tx?)` take an
   optional transaction, and their Sequelize adapters pass it as `{ transaction }`. The three email
   paths pass the job's `tx`.
2. **An email send is bounded.** `EMAIL_SEND_TIMEOUT_MS`, 10 s, in
   `src/features/shared/auth/infrastructure/providers/TimeoutEmailSender.ts`. `TimeoutEmailSender`
   wraps whichever sender `EMAIL_PROVIDER` selects (`buildAuthFeature`), and rejects a send that
   has not settled by then; the job fails into retry. The Mailpit sender also passes
   `AbortSignal.timeout` to `fetch`, so the request itself is abandoned.

## Options considered

- _Reading before `runOnce`._ The read would happen outside the transaction that writes, and a
  caller that nests would still hold two connections.
- _A larger pool._ It raises the number of concurrent jobs it takes to deadlock, and fixes nothing.
  The pool size is not changed (kit D-04); a configurable pool is N8 of the 2026-06-05 run.
- _Sending after the commit._ Loses the email whenever the send fails (ADR-0067).
- _A timeout in each sender, or as configuration._ Three copies, with none for the console sender;
  and no platform asks for another value.

## Consequences

- Each job holds one connection. Jobs beyond the pool's five wait their turn rather than deadlock,
  and with a send bounded at 10 s the wait is bounded.
- A send that the provider completes after the bound is sent again on retry: at least once, as a
  crash already is.
- A new port method that a `runOnce` job may call takes an optional transaction, as `create` and
  `save` already do.

## Links

- `src/shared/infrastructure/queue/SequelizeMessageIdempotency.ts` (`runOnce`)
- `src/features/shared/auth/application/use-cases/{RequestEmailVerification,RequestPasswordReset,InviteUserToOrganization}.ts`
- `src/features/shared/auth/infrastructure/providers/TimeoutEmailSender.ts`
- Tests: `__tests__/integration/features/auth/email-jobs-concurrency.integration.test.ts`
