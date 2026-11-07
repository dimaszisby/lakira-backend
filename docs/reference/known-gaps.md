# Known gaps

**Purpose:** what a fork of this template inherits knowingly: gaps that were looked at and kept,
with the reason, so they are not raised again as findings.
**Owner:** whoever changes the decision a row cites.

Open work is in [GitHub Issues](https://github.com/dimaszisby/lakira-backend/issues)
([`issue-tracker.md`](issue-tracker.md)); a gap here is not open work. Security problems are
reported privately, as [`SECURITY.md`](../../SECURITY.md) says, and the security gaps already known
are listed there.

| Gap                                                                                                                              | Why it stays                                                                                                                                                                                         | Decided in                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nothing deletes rows from `processed_messages`, the table that makes a consumer idempotent; it grows with every message consumed | A cleanup needs a retention longer than any parking-lot replay, a scheduler the codebase does not have, and probably an index on `processed_at`. Deliberately not built until volume makes it matter | [ADR-0007](../explanation/decisions/adr-0007-processed-messages-table-for-idempotency.md) § Consequences; `docs/internal/todos/2026-09-15-todo-processed-messages-cleanup.md`; register row B-41 |

Each row came from the debt register when it was frozen on 2026-10-29
([ADR-0085](../explanation/decisions/adr-0085-every-task-starts-from-an-issue.md)).
