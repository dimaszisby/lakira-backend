# RabbitMQ Async Queue

## Overview

RabbitMQ is the durable async work broker for Lakira Backend. It decouples
long-running or fire-and-forget work from the HTTP request lifecycle.

Redis continues to handle caching, rate limiting, and sessions.
RabbitMQ handles reliable job queuing, routing, and dead-lettering.

**DRI:** @dimaspramudya  
**Status:** PR 1 (scaffolding) merged — feature in progress

## Scope

**In scope:**

- Shared `MessageQueuePort` + `RabbitMQPublisher` / `RabbitMQConsumer` adapters
- Topic exchange topology with parking-lot DLX
- `processed_messages` idempotency table
- `src/worker.ts` — separate runtime entry point
- `GenerateDummyMetricLogs` migrated to async (PR 2)

**Out of scope (follow-up):**

- Email / webhook producers
- TTL-based exponential backoff retry queues
- Quorum queues
- Job status polling API

## Architecture

```
HTTP Request  →  RabbitMQPublisher.publish(exchange, payload, { routingKey })
                       │
              lakira.jobs (topic exchange)
                       │
     ┌─────────────────┘
     ▼
lakira.metric-log.generate-dummy (queue, durable)
     │   on error (nack, no-requeue)
     └──▶ lakira.jobs.parking exchange
              │
              ▼
         lakira.jobs.parking.queue  ← no consumer, alert on depth > 0

Worker  →  RabbitMQConsumer  →  handler(msg)  →  ack / nack
```

## Key Files

| Path                                                          | Role                                          |
| ------------------------------------------------------------- | --------------------------------------------- |
| `src/shared/application/ports/MessageQueuePort.ts`            | Domain-facing port interface                  |
| `src/shared/infrastructure/queue/topology.ts`                 | Exchange/queue declarations                   |
| `src/shared/infrastructure/queue/RabbitMQConnection.ts`       | Singleton connection manager                  |
| `src/shared/infrastructure/queue/RabbitMQPublisher.ts`        | MessageQueuePort implementation (server side) |
| `src/shared/infrastructure/queue/RabbitMQConsumer.ts`         | Consumer with prefetch, manual ack, drain     |
| `src/shared/infrastructure/queue/NoopMessageQueue.ts`         | No-op for disabled/test paths                 |
| `src/worker.ts`                                               | Worker process entry point                    |
| `src/migrations/20260420000000-create-processed-messages.cjs` | Idempotency table migration                   |

## Commands & Environment

```bash
npm run worker:dev      # Start worker in development (tsx watch)
npm run worker          # Start worker in production (dist/worker.js)
```

| Variable                       | Default     | Description                                         |
| ------------------------------ | ----------- | --------------------------------------------------- |
| `RABBITMQ_ENABLED`             | `false`     | Master switch — must be `true` to connect           |
| `RABBITMQ_URL`                 | —           | Full AMQP URL (overrides host/port/user/pass/vhost) |
| `RABBITMQ_HOST`                | `127.0.0.1` | Broker host                                         |
| `RABBITMQ_PORT`                | `5672`      | AMQP port (use `5671` for AMQPS in prod)            |
| `RABBITMQ_USER`                | `guest`     | Broker username                                     |
| `RABBITMQ_PASSWORD`            | `guest`     | Broker password                                     |
| `RABBITMQ_VHOST`               | `/`         | Virtual host                                        |
| `RABBITMQ_PREFETCH`            | `10`        | Consumer QoS prefetch count                         |
| `RABBITMQ_MAX_RETRIES`         | `5`         | Retries before parking (`0` parks on first failure) |
| `RABBITMQ_RETRY_BASE_DELAY_MS` | `2000`      | First retry delay; doubles per retry, 5 min cap     |

## Verification

1. `docker compose up -d` — confirm `rabbitmq_queue` is healthy
2. Open management UI: `http://localhost:15672` (guest/guest)
3. `npm run dev` (server) + `npm run worker:dev` (worker) in separate terminals
4. With `RABBITMQ_ENABLED=false` (default): server and all existing tests unaffected

## References

- [Plan](./rabbitmq-plan.md)
- [Checklist](./rabbitmq-checklist.md)
- [Decisions](./decisions.md)
- [RabbitMQ official docs](https://www.rabbitmq.com/docs)
- [amqp-connection-manager](https://github.com/jwalton/node-amqp-connection-manager)
