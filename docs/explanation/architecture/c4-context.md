# C4 Level 1 — System context

What the backend talks to, and who talks to it.

```mermaid
graph TB
    user["End user<br/><small>tracks personal metrics</small>"]
    admin["Organization owner / admin<br/><small>invites members, manages roles</small>"]

    subgraph boundary [" "]
        api["<b>Lakira Backend</b><br/>REST API + async worker<br/><small>Node 24 · Express · TypeScript</small>"]
    end

    web["Web frontend<br/><small>separate Next.js repository</small>"]
    pg[("PostgreSQL<br/><small>system of record</small>")]
    redis[("Redis<br/><small>cache · rate limits · lockout</small>")]
    mq["RabbitMQ<br/><small>async jobs</small>"]
    mail["Resend<br/><small>transactional email</small>"]
    sentry["Sentry<br/><small>error tracking</small>"]

    user --> web
    admin --> web
    web -->|"HTTPS · JSON · Bearer JWT"| api

    api -->|"SQL"| pg
    api <-->|"cache · counters"| redis
    api -->|"publish"| mq
    mq -->|"consume"| api
    api -->|"verification · reset · invite mail"| mail
    api -.->|"errors, when SENTRY_DSN set"| sentry

    classDef sys fill:#1f6feb,stroke:#1a4f8a,color:#fff
    classDef ext fill:#6e7781,stroke:#4a5058,color:#fff
    classDef person fill:#0d7a5f,stroke:#0a5d48,color:#fff
    class api sys
    class web,pg,redis,mq,mail,sentry ext
    class user,admin person
    style boundary fill:none,stroke:#1f6feb,stroke-dasharray:4 4
```

## What this shows

**The frontend is a separate repository.** This repo serves JSON only. The contract between them
is the generated OpenAPI spec plus
[`../../reference/frontend-handoff.md`](../../reference/frontend-handoff.md).

**Two kinds of human, one API.** There is no separate admin service. Organization owners and
admins hit the same endpoints; authorisation is a role check on the membership row, not a
different deployment. See [ADR-0030](../decisions/adr-0030-membership-role-replaces-users-role.md).

**Three of the six externals are optional.** RabbitMQ is off unless `RABBITMQ_ENABLED=true` (a
no-op queue is substituted). Sentry is off unless `SENTRY_DSN` is set. Email falls back to a
console adapter unless `EMAIL_PROVIDER=resend`. Redis is required by default but the app degrades
to in-memory rate limiting when `REDIS_REQUIRED=false`.

That optionality is deliberate: a fork should boot with only PostgreSQL running. See
[`../../reference/configuration.md`](../../reference/configuration.md).

**PostgreSQL is the only system of record.** Redis holds nothing that cannot be recomputed.

## Next

[Level 2 — containers](./c4-containers.md) opens the blue box.
