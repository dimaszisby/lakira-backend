# ADR-0006 — Separate publisher and consumer connections

- **Status:** Accepted
- **Date:** 2026-04-20
- **Origin:** `ADR-003` in the RabbitMQ kit — [`rabbitmq`](../../internal/initiatives/rabbitmq/decisions.md)

---

## Context

RabbitMQ can apply a memory/disk alarm that blocks the publish
connection. If publish and consume share a connection, consumers freeze too.

## Decision

`RabbitMQPublisher` and each `RabbitMQConsumer` create their own
`ChannelWrapper` on the shared `AmqpConnectionManager` instance. The connection
manager uses a single TCP connection per process; channels are multiplexed but
logically separate.

## Consequences

Publisher block does not starve consumers. Each channel
re-asserts topology on reconnect via its own `setup` callback.

---
