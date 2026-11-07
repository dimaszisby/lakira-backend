# RabbitMQ Integration Plan

## Context & Goals

Lakira Backend currently processes all work synchronously inside the HTTP request
lifecycle. The most visible problem is `GenerateDummyMetricLogs`, which loops
N DB inserts while holding the request thread. Cache pattern-invalidation on
large datasets shares the same shape, as do future needs (email, webhooks,
exports, analytics aggregation).

**Goal:** introduce RabbitMQ as a durable async work broker so that long-running
or fire-and-forget work is offloaded to a dedicated worker process with
at-least-once delivery guarantees and a parking lot for poison messages.

## Phases / Milestones

### Phase 0 — Environment Setup

- Add `rabbitmq:3.13-management-alpine` to `docker-compose.yml`
- Add `RABBITMQ_*` vars to `zodEnv.ts` and env example files
- Install `amqplib` + `amqp-connection-manager`

### Phase 1 — Shared Infrastructure (PR 1 — scaffolding)

- `MessageQueuePort` interface (shared application port)
- `RabbitMQConnection` — singleton connection manager with reconnect
- `RabbitMQPublisher` — confirm channel, topology setup, mandatory+return handler
- `RabbitMQConsumer` — prefetch, manual ack, DLX nack, cancel+drain shutdown
- `topology.ts` — declarative exchange/queue definitions
- `NoopMessageQueue` — disabled/test fallback
- `src/worker.ts` — worker process entry point
- `processed_messages` migration for idempotency
- `RABBITMQ_ENABLED=false` default → zero impact on existing code

### Phase 2 — First Feature Migration (PR 2)

- Refactor `GenerateDummyMetricLogs` into async producer (returns 202 + jobId)
- `GenerateDummyMetricLogsHandler` consumer registered in worker
- Controller returns 202 Accepted
- Update OpenAPI spec

### Phase 3 — Staging Validation (PR 3)

- Enable `RABBITMQ_ENABLED=true` in staging
- Observe for ~1 week: queue depths, unacked counts, parking lot
- Enable in production after sign-off

## Success Metrics

- `POST /metric-logs/generate-dummy` p99 latency < 100ms (was: proportional to `count`)
- Zero messages in parking lot under normal operation
- Worker graceful shutdown drains in-flight within 30s
- `npm test` unchanged when `RABBITMQ_ENABLED=false`

## Risks & Mitigations

| Risk                            | Mitigation                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Worker not deployed             | Alert on `rabbitmq_queue_messages_ready > N` for 5 min; sync fallback while disabled |
| Duplicate delivery              | `processed_messages` table + tx-wrapped handler                                      |
| Publisher block on memory alarm | Separate publish/consume connections; bounded publish buffer                         |
| CI test fragility               | Integration RabbitMQ tests gated on `RABBITMQ_ENABLED=true`                          |

## Open Questions

- ~~Which client library?~~ → `amqp-connection-manager` (reconnect + publish buffer)
- ~~Exchange topology?~~ → Topic exchange `lakira.jobs` + parking DLX
- Tiered retry backoff (TTL-based queues) — deferred to follow-up
- Job status polling endpoint — deferred to follow-up
