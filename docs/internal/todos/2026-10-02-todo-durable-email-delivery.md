# Todo — transactional email is not durable

- **Status:** Closed for the verification email, on `fix/durable-verification-email` (ADR-0067). Password reset and invites moved to B-70
- **Created:** 2026-10-02
- **Owner:** unassigned
- **Origin:** kit `drainable-background-work` D-01; recorded in ADR-0054 § Consequences

---

## What

The verification email in `register` and `resendVerification` runs in process after the response,
through `runInBackground` (`src/utils/background-tasks.ts`). Shutdown waits for it for up to 10
seconds, but the work exists only in memory: a SIGKILL, a crash, or a drain timeout loses it, and
a failed send is logged and never retried. The user then has to ask for the email again.

## Suggested fix

Publish an email job and send it from the worker, which already has retries, a parking-lot queue
and idempotent handlers (ADR-0005, ADR-0007); or write an outbox row in the same transaction as
the token and have a sender drain it. Either has to cope with `RABBITMQ_ENABLED=false`, where the
in-process path must remain. It is an architectural change: Full or Standard kit, and an ADR that
supersedes the relevant part of ADR-0054.

## Resolution

**2026-10-18.** The verification email is a queued job
([ADR-0067](../../explanation/decisions/adr-0067-the-verification-email-is-a-queued-job.md), kit
[`durable-verification-email`](../initiatives/durable-verification-email/README.md)). It is the
first suggested fix: a job for the worker, which retries with backoff, parks after
`RABBITMQ_MAX_RETRIES` and deduplicates. The message carries the user id only; the worker mints the
token and sends inside the idempotency transaction. With `RABBITMQ_ENABLED=false`, or when a
publish fails, the in-process path runs as before. The outbox was not built.

Out of scope by the owner's choice: the password-reset and invite emails, filed as
`2026-10-18-todo-reset-and-invite-email-not-durable.md` (register row B-70).
