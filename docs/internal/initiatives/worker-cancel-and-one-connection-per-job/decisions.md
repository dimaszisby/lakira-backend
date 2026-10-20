# Decisions — worker-cancel-and-one-connection-per-job

## D-01 — Cancel on the channel that owns the consumer

- **Status:** Proposed
- **Date:** 2026-10-21

**Context.** `RabbitMQConsumer` calls `ch.consume` on the raw `amqplib` channel inside the wrapper's
`setup`, and acks and nacks on that same channel, the one that delivered the message.
`amqp-connection-manager` 5.0.0 keeps its own list of consumers registered through
`ChannelWrapper.consume`; `ChannelWrapper.cancel(tag)` looks the tag up there, finds nothing, and
returns. So `cancel()` cancels nothing. `setup` also runs again after every reconnect, and would
consume again.

**Decision.** Keep the raw-channel `consume` in `setup`, and keep that channel beside its tag.
`cancel()` marks the consumer stopping first, then cancels the tag on the channel that owns it. A
`setup` that runs while stopping (a reconnect during the drain) declares the topology and does not
consume.

**Options considered.** The wrapper's own `consume`: it tracks the tag and re-consumes after a
reconnect, but its `ack` goes to whatever channel is current, so a message delivered before a
reconnect would be acked on the new channel with a delivery tag it never issued, and the broker
closes that channel. `cancelAll()` on the wrapper: same list, same no-op.

**Consequences.** `cancel` is idempotent and safe after the channel has closed. The drain now waits
only for messages already delivered.

## D-02 — Work inside `runOnce` uses only its transaction

Promoted to the architecture decision registry as
**[ADR-0077](../../../explanation/decisions/adr-0077-a-queued-job-holds-one-connection.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — An email send is bounded

Promoted to the architecture decision registry as
**[ADR-0077](../../../explanation/decisions/adr-0077-a-queued-job-holds-one-connection.md)**.
That file is authoritative; this entry is a pointer.

## D-04 — The pool size is not changed here

- **Status:** Proposed
- **Date:** 2026-10-21

**Context.** X62's todo suggested a pool larger than the consumers' combined prefetch. `db.ts` sets
no pool, so Sequelize's default of five applies, to the server and the worker alike. N8 of the
2026-06-05 run records the missing setting.

**Decision.** Leave the pool alone. With one connection per job (D-02), jobs beyond five wait their
turn instead of deadlocking, and with sends bounded (D-03), the wait is bounded.

**Options considered.** A constant larger pool: it changes the server's connection count on every
platform, with no measurement behind the number. A configurable pool: an env var, an ADR and
`configuration.md`, for a question X62 did not ask.

**Consequences.** Under a provider that hangs, a burst of more than five jobs takes several send
bounds to clear. N8 stays a separate item.
