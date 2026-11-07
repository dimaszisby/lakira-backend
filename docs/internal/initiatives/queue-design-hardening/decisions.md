# Decisions — queue-design-hardening

Schema change: `20261020000001-processed-messages-key-per-queue.cjs` (D-01).

## D-01 — The dedup key is `(message_id, queue)`

Promoted to the architecture decision registry as
**[ADR-0073](../../../explanation/decisions/adr-0073-dedup-per-queue-and-retry-tiers.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — A retry waits in the queue of its delay

Promoted to the architecture decision registry as
**[ADR-0073](../../../explanation/decisions/adr-0073-dedup-per-queue-and-retry-tiers.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — Every job's body is read, then checked, before anything acts on it

Promoted to the architecture decision registry as
**[ADR-0073](../../../explanation/decisions/adr-0073-dedup-per-queue-and-retry-tiers.md)**.
That file is authoritative; this entry is a pointer.
