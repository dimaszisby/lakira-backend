# ADR-0038 — The observability stack attaches as a backing service, not a bundled dependency

- **Status:** Proposed
- **Date:** 2026-08-17
- **Related:** Depends on [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md) — the log stream
  must exist before a collector can be pointed at it. Extends the deferral recorded in
  [ADR-0021](./adr-0021-sentry-init-lifecycle.md) ("APM/tracing is its own (P2-5.4) decision and
  likely Prometheus + OpenTelemetry, not Sentry traces"). Made cheaper by [ADR-0042](./adr-0042-vps-compose-deployment-topology.md).
- **Origin:** `TF-5` in the twelve-factor audit kit — [`twelve-factor`](../../internal/audits/twelve-factor/audit-2026-08-17.md)

---

## Context

The backend has one telemetry integration: Sentry, for errors, gated on `SENTRY_DSN`
(`src/server.ts:56-62`). There is no metrics and no tracing instrumentation of any kind —
`grep -rniE "@opentelemetry|prom-client|prometheus"` across `src/` and `package.json` returns
nothing. Three prior audits recorded this as deferred work (`P2-5.4`, then `N7`), and the
observability initiative scoped it out explicitly.

A concrete proposal now exists: adopt OpenTelemetry for instrumentation with a
Prometheus/Loki/Grafana/Tempo stack behind it. The open question is how that stack ships —
as an optional Docker Compose profile, or baked into the default configuration.

Three facts from the twelve-factor audit shape the answer.

**The question is really two questions.** "The observability stack" conflates the SDK compiled into
the application with the collectors that receive its output. These have opposite deployment
profiles: the SDK ships inside the release artefact and must exist in every environment; the
collectors are separate processes that in production are managed services and in local development
are containers. Deciding them together produces a bad answer for one of them.

**This repo is a fork template.** `scripts/bootstrap-fork.sh` exists so the codebase can be
rebranded and reused. Anything in the default `docker compose up` path is a cost imposed on every
fork. Grafana, Loki, Tempo, Prometheus, and an OTel collector are five containers with meaningful
memory footprints; the current default stack is three.

**The codebase already has an idiom for this.** Optional backing services are gated by an env var
and given an inert adapter: `RABBITMQ_ENABLED` selects between `RabbitMQPublisher` and
`NoopMessageQueue` behind `MessageQueuePort` ([ADR-0004](./adr-0004-use-amqp-connection-manager.md),
[ADR-0006](./adr-0006-separate-publisher-and-consumer-connections.md)), and `SENTRY_DSN` gates
`Sentry.init` ([ADR-0021](./adr-0021-sentry-init-lifecycle.md)). Both treat an absent service as a
normal configuration, not a degraded one. A third mechanism for a third optional service would be
unjustified novelty.

There is also a small existing signal that the bundled-by-default approach drifts: RabbitMQ's
Prometheus metrics port is already published in `docker-compose.yml:66` (`"15692:15692"`) and
nothing has ever scraped it.

## Decision

**Telemetry is an attached resource, addressed by endpoint configuration, and absent by default.**
Concretely:

1. **The OTel SDK is a production dependency, always compiled in, and inert unless configured.**
   Initialisation is gated on `OTEL_EXPORTER_OTLP_ENDPOINT` being set — the same shape as
   `if (env.SENTRY_DSN)`. Unset means no exporter, no background flush, no measurable overhead. The
   variable joins `src/config/zodEnv.ts` as an optional string, alongside `OTEL_SERVICE_NAME`
   (defaulting to `APP_NAME`) and `OTEL_TRACES_SAMPLER_ARG`.

2. **The collector stack ships as an opt-in Compose profile**, not in the default services. It lives
   in `docker-compose.observability.yml` under `profiles: ["observability"]`, started with
   `docker compose --profile observability up`. `docker compose up` continues to start exactly
   Postgres, Redis, RabbitMQ, and the app.

3. **Production never uses that profile.** Staging and production set
   `OTEL_EXPORTER_OTLP_ENDPOINT` to a managed collector endpoint. The Compose profile is a local
   development and CI convenience for exercising the pipeline end to end — it is not the production
   topology, and the repo does not pretend to define the production topology.

4. **Metrics are exported over OTLP, not scraped.** No `/metrics` endpoint is added to the Express
   app. A scrape endpoint would need its own authentication story on a public-facing service
   (the saas-readiness audit's suggested IP allowlist), and push-based OTLP avoids that surface
   entirely. Prometheus, when used, scrapes the collector rather than the app.

5. **Every telemetry signal goes through the SDK, with one exception.** Logs remain stdout, per
   [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md); Loki collects them from the platform's
   log stream rather than from an in-process exporter. The app does not ship its own logs.

The general rule this establishes, and the reason it is worth an ADR: **an optional backing service
is configured by its endpoint, defaults to absent, and gets an inert path — never a bundled process
the application assumes is co-located.**

## Options considered

- _Bake the full stack into default `docker-compose.yml`._ Rejected. It makes five containers
  mandatory for every contributor and every fork, to serve a capability most of them will not use
  locally, and it encodes a production topology this repo does not own. It also inverts the
  established pattern — RabbitMQ, the closest analogue, is opt-in via a flag.
- _Optional Compose profile **and** SDK gated by a separate `OTEL_ENABLED` boolean._ Considered, and
  rejected for the boolean only. Two switches for one concern is the failure mode
  [ADR-0036](./adr-0036-refuse-production-unsafe-env-switches.md) warns about: `OTEL_ENABLED=true`
  with no endpoint, or an endpoint with the flag off, are both silently broken states. Presence of
  the endpoint is the configuration; a boolean adds a way to disagree with it.
- _Expose `/metrics` for Prometheus to scrape (the saas-readiness `P2-5.4` recommendation)._
  Rejected. It puts an operational surface on the public application, requires an auth decision this
  ADR would rather not force, and pins the design to Prometheus specifically. OTLP export keeps the
  backend interchangeable.
- _Extend Sentry to cover tracing instead of adopting OTel._ Rejected, consistent with ADR-0021's
  own reasoning. It couples the tracing story to one vendor's SDK, and Sentry's metrics support is
  materially weaker than its error support.
- _Defer again until there is production load worth measuring._ Considered seriously — this has been
  deferred three times and the deferral has not yet caused an incident. Rejected because Factor XI
  (ADR-0041) is being fixed now regardless, and it is cheaper to decide the destination of the log
  stream once than to move it twice.

## Consequences

- `docker compose up` is unchanged: four services, same startup cost. Forks inherit no observability
  containers and no obligation to run them.
- With `OTEL_EXPORTER_OTLP_ENDPOINT` unset — the default in development, test, and any fork — the SDK
  is compiled in and does nothing. The dependency cost is real (`@opentelemetry/*` packages in
  `dependencies`) and is accepted deliberately: a telemetry SDK that must be installed before it can
  be switched on is one that never gets switched on during an incident.
- A new failure mode: a wrong or unreachable `OTEL_EXPORTER_OTLP_ENDPOINT` fails quietly, since
  exporters buffer and drop rather than throw. `/api/v1/ready` deliberately does **not** gain a
  telemetry check — a metrics pipeline outage must not remove instances from the load balancer.
  Detection belongs in the collector's own alerting.
- Production observability topology is explicitly out of this repo's scope. `docs/reference/environments.md`
  gains a row for the endpoint per environment; the collectors themselves are not defined here.
- The container diagram gains a fifth external system. Update
  [`c4-context.md`](../architecture/c4-context.md) with a dashed edge from the API server to the
  collector, matching the existing dashed `errors, when SENTRY_DSN set` edge to Sentry — the same
  visual convention for the same kind of conditional attachment.
- This ADR does not choose between Grafana Cloud, self-hosted, or another OTLP-compatible backend.
  That is a procurement decision, and the point of exporting OTLP is that it stays reversible.

## Links

- [`audit-2026-08-17.md`](../../internal/audits/twelve-factor/audit-2026-08-17.md) § Factor IV (TF-5)
- [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md) — prerequisite; establishes the stdout
  stream Loki would collect
- [ADR-0021](./adr-0021-sentry-init-lifecycle.md) — the env-gated-init pattern this follows, and the
  ADR that deferred this decision
- [ADR-0036](./adr-0036-refuse-production-unsafe-env-switches.md) — why a redundant boolean switch is
  avoided
- `src/server.ts:56-62` — the `if (env.SENTRY_DSN)` gate being generalised
- `src/shared/infrastructure/queue/NoopMessageQueue.ts` — the inert-adapter precedent
- `docker-compose.yml:66` — RabbitMQ's already-exposed, never-scraped `15692`
- `docs/internal/initiatives/observability/README.md` — the kit that scoped this out as "P2-5.4"
