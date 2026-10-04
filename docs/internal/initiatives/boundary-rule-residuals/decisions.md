# Boundary rule residuals — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Metric's types move into the metric feature

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** `src/types/dtos/metric.dto.ts` and `src/types/domain/metric.domain.ts` import other
features' internals: a Zod schema, three response DTO types and a domain entity. Every file that
imports either of them is in the metric feature (2 and 6 files). The boundary rule covers
`src/features/**` only, so these imports pass (audit S5).
**Decision.** `metric.dto.ts` moves to `metric/infrastructure/http/` and `metric.domain.ts` to
`metric/domain/`, with `git mv`. Their cross-feature references go through the siblings'
`public.ts`, which gain type-only exports.
**Options considered.** Leaving them in `src/types/` and importing `public.ts` from there: rejected,
shared code would still depend on features, in the wrong direction. Dissolving all of `src/types/`
into the features: rejected for this change, the other eleven files import no feature and moving
them is churn the rule does not ask for.
**Consequences.** `src/types/` holds only types no feature owns alone, plus three feature-shaped
files (`metric-log`, `metric-settings`, `user` domain types) that are imported across features and
stay for now. The siblings' `public.ts` grow by a type each.

## D-02 — Shared code imports no feature

- **Status:** Accepted
- **Date:** 2026-10-04

Promoted to the architecture decision registry as **[ADR-0058](../../../explanation/decisions/adr-0058-inner-layers-and-shared-code-import-rules.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — The application layer imports no infrastructure

- **Status:** Accepted
- **Date:** 2026-10-04

Promoted to the architecture decision registry as **[ADR-0058](../../../explanation/decisions/adr-0058-inner-layers-and-shared-code-import-rules.md)**.
That file is authoritative; this entry is a pointer.

## D-04 — Use cases own their input types

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** `UpdateDisplayOptions`, `UpdateMetricSettings` and `UpdateMetric` type their input with
DTO types from `infrastructure/http/`, two of them inferred from Zod schemas.
**Decision.** Each use case declares the input it accepts. The controller passes the validated
body, and the compiler proves the two shapes agree.
**Options considered.** Moving the Zod-inferred DTO types into `application/`: rejected, it drags
the HTTP schema with them.
**Consequences.** A field added to a request schema has to be added to the use case's input before
the use case can read it. The two shapes can drift apart in the permissive direction: a schema
field the use case does not declare is passed and ignored.

## D-05 — The message a handler receives is an application type

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** `GenerateDummyMetricLogsHandler.handle` takes `amqplib`'s `ConsumeMessage` and
`MessageContext` from `RabbitMQConsumer.ts`. It reads two things from the message: `content` and
`properties.messageId`.
**Decision.** `src/shared/application/ports/MessageHandlerPort.ts` declares `IncomingMessage` with
those two fields, `MessageContext` and `MessageHandler`. `amqplib`'s message satisfies
`IncomingMessage` structurally, so `RabbitMQConsumer` passes it straight through.
**Options considered.** An adapter per handler that parses the message first: rejected, more moving
parts for one handler.
**Consequences.** A handler that needs another message field adds it to the port first. That is the
intended friction.

## D-06 — Exchange and routing-key names belong beside the queue port

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** `GenerateDummyMetricLogs` imports `EXCHANGES` and `ROUTING_KEYS` from
`src/shared/infrastructure/queue/topology.ts`, which also holds the code that declares queues on a
broker channel. `MessageQueuePort.publish(exchange, routingKey, …)` already takes those names.
**Decision.** The name constants move to `src/shared/application/messaging/`. `topology.ts`
re-exports them and keeps the code that talks to the broker.
**Options considered.** A feature-owned "enqueue job" port with a RabbitMQ adapter: rejected for
this change. It is the cleaner shape, but it changes a constructor and its wiring for no rule this
task needs.
**Consequences.** The application layer still speaks in exchanges and routing keys, because the
port does. Hiding them is the rejected option above, for a later task.
