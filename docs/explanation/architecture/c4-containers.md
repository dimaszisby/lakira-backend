# C4 Level 2 — Containers

Inside the backend: two process types sharing one codebase and one database — but only one of them
is currently deployed anywhere.

> **The job worker has no deployment.** `src/worker.ts` is fully implemented and has npm scripts.
> Locally it runs as the opt-in Compose `worker` service (`docker compose --profile worker up -d`),
> but there is no Dockerfile `CMD` variant, no CI job, and no staging or production service that
> runs it. The diagram below shows it dashed for that reason. See
> [ADR-0040](../decisions/adr-0040-worker-process-deployment-topology.md) and
> [`audit-2026-08-17.md`](../../internal/audits/twelve-factor/audit-2026-08-17.md) § Factor VIII.
> Remove this note and the dashed styling in the PR that deploys it.

```mermaid
graph TB
    web["🖥️ Web frontend<br/><small>separate repo</small>"]

    subgraph sys ["Lakira Backend"]
        direction TB
        api["<b>API server</b><br/><code>src/server.ts</code><br/><small>Express · port 5000<br/>npm start</small>"]
        worker["<b>Job worker</b><br/><code>src/worker.ts</code><br/><small>RabbitMQ consumer<br/>not deployed — ADR-0040</small>"]
    end

    pg[("PostgreSQL<br/><small>Sequelize · 12 tables</small>")]
    redis[("Redis<br/><small>viz cache · rate limits · login lockout</small>")]
    mq["RabbitMQ<br/><small>topic exchange <code>&lt;app&gt;.jobs</code><br/>parking-lot DLX</small>"]
    mail["Resend / console<br/><small>EmailSender port</small>"]

    web -->|"REST · Bearer JWT"| api

    api -->|"read / write"| pg
    api <-->|"cache, counters"| redis
    api -->|"publish job"| mq
    api -->|"verification · reset · invite"| mail

    mq -->|"consume, prefetch 10"| worker
    worker -->|"write results"| pg
    worker -->|"invalidate cache"| redis

    classDef proc fill:#1f6feb,stroke:#1a4f8a,color:#fff
    classDef undeployed fill:#1f6feb,stroke:#f0883e,stroke-width:2px,stroke-dasharray:5 3,color:#fff
    classDef store fill:#6e7781,stroke:#4a5058,color:#fff
    class api proc
    class worker undeployed
    class pg,redis,mq,mail,web store
    style sys fill:none,stroke:#1f6feb,stroke-dasharray:4 4
```

## The two processes

|             | API server                                | Job worker                                     |
| ----------- | ----------------------------------------- | ---------------------------------------------- |
| Entry point | `src/server.ts`                           | `src/worker.ts`                                |
| Start       | `npm start`                               | `npm run worker`                               |
| Deployed?   | yes — Render today (ADR-0042 plans a VPS) | **no** — local Compose profile only (ADR-0040) |
| Handles     | every HTTP request                        | queue messages only                            |
| Scales on   | request volume                            | queue depth — once deployed                    |
| Required?   | yes                                       | only with `RABBITMQ_ENABLED=true`              |

They share the same `src/`, the same models, and the same database. The worker exists so that
slow or fire-and-forget work does not occupy a request thread — today that is dummy metric-log
generation, consumed from `QUEUES.METRIC_LOG_GENERATE_DUMMY`.

## Request path through the API server

Middleware order in `src/server.ts` is deliberate — each layer assumes the previous one ran:

```mermaid
graph LR
    r["request"] --> json["express.json"] --> cookie["cookie-parser"]
    cookie --> rid["request-id<br/><small>AsyncLocalStorage</small>"]
    rid --> alog["access log"] --> helm["helmet"]
    helm --> https["HTTPS redirect<br/><small>production only</small>"] --> xss["xss-clean"] --> hpp["hpp"]
    hpp --> trace["disallow TRACE"] --> cors["cors"]
    cors --> rl["global rate limiter<br/><small>after /health, /ready</small>"]
    rl --> route["feature router"] --> auth["authMiddleware<br/><small>per route</small>"]
    auth --> zod["Zod validation"] --> ctrl["controller"] --> uc["use case"]
    uc --> err["error handler"] --> resp["response"]

    classDef sec fill:#8250df,stroke:#6639ac,color:#fff
    classDef app fill:#1f6feb,stroke:#1a4f8a,color:#fff
    class helm,https,xss,hpp,trace,cors,rl,auth sec
    class route,zod,ctrl,uc app
```

Request-ID runs early so every later log line — including one emitted by the error handler —
carries the same correlation id. It uses `AsyncLocalStorage` rather than a library; see
[ADR-0027](../decisions/adr-0027-asynclocalstorage-for-request-correlation.md).

## Queue topology

A topic exchange with a parking-lot dead-letter exchange: a failed message waits out an
exponential backoff in a per-queue retry queue, and one that fails past `RABBITMQ_MAX_RETRIES` —
or fails terminally — is parked rather than dropped or infinitely redelivered.
Publisher and consumer hold separate connections, so a blocked consumer cannot stall publishing
([ADR-0006](../decisions/adr-0006-separate-publisher-and-consumer-connections.md)).

Redelivery makes at-least-once the default, so handlers must be idempotent. The
`processed_messages` table records what has already been handled
([ADR-0007](../decisions/adr-0007-processed-messages-table-for-idempotency.md)).

## What Redis holds

Visualization caches, rate-limit counters, and login-lockout counters — all recomputable. Losing
Redis costs latency and resets counters; it loses no durable state.

Every cache key carries `organizationId` as well as `userId`
([ADR-0035](../decisions/adr-0035-tenant-scoped-cache-keys.md), closed the 2026-06-05 P0 in
`f5f28b9`). `__tests__/unit/architecture.test.ts` ("cache keys are tenant-scoped") fails the build
if a new cache-key template drops it.

## Next

[Level 3 — the auth component](./c4-components-auth.md) opens the API server.
