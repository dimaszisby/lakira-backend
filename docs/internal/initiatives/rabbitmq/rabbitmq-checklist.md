# RabbitMQ Integration Checklist

## Phase 0 — Environment Setup

- [x] Add `rabbitmq:3.13-management-alpine` to `docker-compose.yml` — _pending user confirmation (hook protected)_
- [x] Add `RABBITMQ_*` vars to `src/config/zodEnv.ts` — branch `pr/dev-weeks-work`
- [x] Add `normalizeRabbitMQConfig` to `buildEnv` — branch `pr/dev-weeks-work`
- [x] Add `RABBITMQ_*` vars to `.env.test.example` — present; retry var added in #92 (`c17c923`)
- [x] Install `amqplib`, `amqp-connection-manager`, `@types/amqplib`

## Phase 1 — Shared Infrastructure (PR 1)

- [x] `src/shared/application/ports/MessageQueuePort.ts`
- [x] `src/shared/infrastructure/queue/topology.ts`
- [x] `src/shared/infrastructure/queue/RabbitMQConnection.ts`
- [x] `src/shared/infrastructure/queue/RabbitMQPublisher.ts`
- [x] `src/shared/infrastructure/queue/RabbitMQConsumer.ts`
- [x] `src/shared/infrastructure/queue/NoopMessageQueue.ts`
- [x] `src/worker.ts` — worker entry point with graceful shutdown
- [x] `src/migrations/20260420000000-create-processed-messages.cjs`
- [x] Add `worker`, `worker:dev`, `worker:staging` scripts to `package.json`
- [x] Wire `connectRabbitMQ` + `disconnectRabbitMQ` into `src/server.ts` shutdown
- [x] `npm run typecheck` passes clean
- [x] Documentation kit (README, plan, checklist, decisions) — this file

## Phase 2 — First Feature Migration (PR 2)

- [x] `src/features/metric-log/application/use-cases/GenerateDummyMetricLogsHandler.ts` — consumer handler
- [x] Refactor `GenerateDummyMetricLogs` use-case into async producer (queue path) + sync fallback
- [x] `feature.ts` accepts optional `messageQueue: MessageQueuePort`; defaults to `NoopMessageQueue`
- [x] `server.ts` injects `RabbitMQPublisher` when `RABBITMQ_ENABLED=true`
- [x] Controller returns `202 Accepted` + `{ jobId }`
- [x] Consumer registered in `src/worker.ts`
- [x] Controller unit test updated (201 → 202, mock return `{ jobId }`)
- [x] `npm run typecheck` + `npm run lint` clean; 57 unit suites pass
- [x] Integration test: sync path covered (`POST /:metricId/dummy` → 202 + jobId, 403, 401, 400); broker round-trip (Testcontainers) is a follow-up ticket
- [x] Update OpenAPI spec — `POST /metric-logs/{metricId}/dummy` → 202 + `{ jobId }`, regenerated `docs/reference/api/lakira-backend-openapi.json`

## Phase 3 — Staging Validation

- [ ] Enable `RABBITMQ_ENABLED=true` in staging env
- [ ] Observe management UI for 1 week (queue depths, unacked, parking lot)
- [ ] Enable in production
