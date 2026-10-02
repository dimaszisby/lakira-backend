# Todo — transactional email is not durable

- **Status:** Open (P3)
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
