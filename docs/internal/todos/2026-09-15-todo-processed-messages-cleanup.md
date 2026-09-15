# Todo — periodic cleanup of `processed_messages`

- **Status:** Not started — noted, deliberately not built
- **Created:** 2026-09-15
- **Owner:** unassigned
- **Origin:** raised while implementing ADR-0007 consumer idempotency
  ([`2026-09-15-todo-consumer-idempotency.md`](./2026-09-15-todo-consumer-idempotency.md))

---

## The gap

[ADR-0007](../../explanation/decisions/adr-0007-processed-messages-table-for-idempotency.md)'s
Consequences section says the table _"grows unbounded — a periodic cleanup job (delete rows older
than N days) should be added in a follow-up."_ Since the idempotency work, every consumed message
writes one row to `processed_messages`, and nothing deletes them.

## What to decide before building

- **Retention N.** Dedup is only needed while a redelivery or a parking-lot replay is still
  plausible. N must exceed the longest time a message can sit in the parking lot before someone
  replays it. A replay older than N would be processed a second time.
- **Where it runs.** It could be a scheduled job in the worker, a cron container under ADR-0042, or
  a DB-side schedule. There is no scheduler in the codebase today.
- **How it deletes.** Delete in batches on `processed_at`. There is no index on `processed_at` (only
  the PK and `idx_processed_messages_organization_id`), so a large delete may need one, which means
  a migration.

## Out of scope here

Retry policy (`RABBITMQ_MAX_RETRIES` is still read nowhere), parking-lot monitoring, and ADR-0038
queue observability. Those are separate follow-ups.
