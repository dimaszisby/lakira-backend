# ADR-0004 — Use `amqp-connection-manager` over raw `amqplib`

- **Status:** Accepted
- **Date:** 2026-04-20
- **Origin:** `ADR-001` in the RabbitMQ kit — [`rabbitmq`](../../internal/initiatives/rabbitmq/decisions.md)

---

## Context

`amqplib` has no built-in reconnect; a TCP close terminates all
in-flight publishes silently. Production brokers restart, network blips happen.

## Decision

Use `amqp-connection-manager` v4, which wraps `amqplib`, adds
automatic reconnect with channel re-setup callbacks, and buffers publishes
while disconnected.

## Options considered

- Raw `amqplib` — leaner, but reconnect/buffer must be hand-rolled.
- `rhea` — AMQP 1.0 client; RabbitMQ 3.x has limited AMQP 1.0 support.
- BullMQ (Redis-backed) — already have Redis, but lacks exchange/routing semantics and durable broker guarantees.

## Consequences

One extra dependency. API is a thin wrapper — migration to raw
`amqplib` is straightforward if needed.

---
