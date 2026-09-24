# ADR-0040 — The worker is a first-class process type with its own deployment

- **Status:** Proposed
- **Date:** 2026-08-17
- **Related:** Pairs with [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md) — both
  concern what a Lakira release consists of and what runs it. Gives the queue design of
  [ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md) and
  [ADR-0006](./adr-0006-separate-publisher-and-consumer-connections.md) somewhere to actually run. Its deployment target is changed by [ADR-0042](./adr-0042-vps-compose-deployment-topology.md) (VPS, not Render).
- **Origin:** `TF-4` in the twelve-factor audit kit — [`twelve-factor`](../../internal/audits/twelve-factor/audit-2026-08-17.md)

> **Status note (2026-09-24).** Stays Proposed: partly implemented. The worker has a local
> Compose service (opt-in `worker` profile) and CI coverage of the queue path (`85b4e77`, #86).
> There is no staging or production deployment, and ADR-0042 moves that target to the VPS.

---

## Context

`src/worker.ts` is a complete, competently built second process type: its own database connection,
its own signal handlers, and a shutdown that drains in-flight consumers before closing the broker
and then Postgres (`src/worker.ts:51-68`). It refuses to start without `RABBITMQ_ENABLED` (`:16-21`).
Behind it sits a considered queue design — a topic exchange with a parking-lot DLX
([ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md)), separate publisher and consumer
connections ([ADR-0006](./adr-0006-separate-publisher-and-consumer-connections.md)), and a
`processed_messages` idempotency table ([ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md)).

**Nothing runs it.** `grep -rn "worker" docker-compose.yml docker-compose.test.yml Dockerfile
Dockerfile.dev .github/workflows/` returns no matches. There is no Compose service, no Dockerfile
`CMD` variant, no CI job, and no Render service. Its entire operational existence is three npm
scripts (`package.json:13-15`), one of which (`worker:staging`) invokes `ts-node` — a devDependency
absent from the runtime image.

The documentation states the opposite. `docs/explanation/architecture/c4-containers.md:3` describes
"two deployable processes sharing one codebase and one database," with a table giving the worker a
start command and a scaling axis. That describes an intention, not the system.

Today the gap is inert rather than broken, because `RABBITMQ_ENABLED` also gates publishing
(`src/server.ts:52`, `:240-243`) — with the flag off, nothing is queued, so nothing goes unconsumed.
The failure is latent and sharp-edged: enabling the flag in a deployed environment starts queueing
work that no process will ever consume. Messages accumulate until the broker's limits are reached.

This ADR exists because the fix is not obvious. There are three defensible answers with materially
different costs, and one of them is "delete the tier."

## Decision

**The worker is a separate deployed process, sharing the release artefact and differing only in its
start command.** It is not merged into the web process, and it is not removed.

1. **One image, two commands.** The worker does not get its own Dockerfile. It runs the same image
   as the API server with the command overridden to `node dist/worker.js`. This follows directly
   from [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md): a release is one
   artefact, and process types are start commands against it, not separate builds.

2. **A `worker` service in `docker-compose.yml`**, so the local dev loop can exercise the queue path
   at all. It builds the same context as `app`, overrides `command`, and declares the same
   `depends_on` for `db` and `rabbitmq`.

3. **A `worker` service on Render**, deployed by the same CI job as the API, scaled independently.
   Its scaling signal is queue depth, not request rate.

4. **RabbitMQ joins the CI `tests` job as a service container**, and the queue integration path is
   exercised against a live broker. Without this, the worker's deployment is untested in exactly the
   way that made it easy to leave undeployed.

5. **`worker:staging` is deleted** rather than fixed. It runs `ts-node` against `src/`, which is not
   how the worker will ever run in a deployed environment.

The general rule: **a process type that exists in the codebase must exist in the deployment
topology, or be deleted from the codebase.** A third state — implemented, documented, and unrunnable
— is the one this ADR forbids, because it is indistinguishable from working software until the
moment it matters.

## Options considered

- _Run the consumer inside the web process._ Considered seriously; it is the cheapest option by a
  wide margin — no new service, no new CI wiring, no additional hosting cost. Rejected on three
  grounds. It makes the two workloads share a scaling axis, so a queue backlog forces web instances
  to be added and vice versa. It breaks the isolation `ADR-0006` deliberately built by putting the
  publisher and consumer connections back in one process. And a slow handler competes with request
  serving for the event loop, which is the specific problem the worker was introduced to avoid
  (`c4-containers.md:48-50`).
- _Delete `src/worker.ts` and the queue infrastructure until there is load to justify them._ A real
  option, and the honest one if the async tier were speculative. Rejected because it is not
  speculative: four ADRs (0004–0007) encode considered design work, the topology and idempotency
  table are built, and the only current consumer — dummy metric-log generation — is a genuine
  fire-and-forget workload. Deleting working infrastructure to avoid deploying it trades a small
  recurring cost for the certainty of rebuilding it later.
- _Give the worker its own Dockerfile._ Rejected. Two images from one source tree doubles the build
  surface and creates the possibility of the two drifting in base image or dependency set — the
  exact class of problem ADR-0039 is closing. Command override is the standard mechanism and costs
  nothing.
- _Deploy the worker but leave `RABBITMQ_ENABLED=false` in production until a real workload exists._
  Considered, and partially adopted: this ADR does not mandate flipping the flag. It mandates that
  when the flag is flipped, a consumer exists. The flag remains the feature switch; the deployment
  stops being the accidental one.
- _Use a scheduled job or serverless function instead of a long-running consumer._ Rejected as a
  larger architectural change than the finding warrants, and incompatible with the existing
  `amqp-connection-manager` design ([ADR-0004](./adr-0004-use-amqp-connection-manager.md)), which
  assumes a persistent connection.

## Consequences

- A second Render service, with its own hosting cost, for a tier whose only current consumer is
  dummy data generation. This is the honest cost of the decision and the strongest argument for the
  in-process alternative. It is accepted because the alternative's costs are structural and this one
  is monetary.
- CI gains a RabbitMQ service container and a slower `tests` job. In exchange, the queue path stops
  being the only major subsystem with no integration coverage against a real dependency.
- The two process types share an image, so a release deploys both together. They cannot drift, and
  they also cannot be rolled back independently — acceptable, since they share a database schema and
  independent rollback would be unsafe anyway.
- `docs/explanation/architecture/c4-containers.md` becomes accurate rather than aspirational. Until
  this ADR is implemented it carries a note recording that the worker has no deployment; that note
  is removed in the same PR that adds the service.
- Worker deployment inherits the migration ordering already established for the API: migrations run
  as a discrete CI step before either service is told to restart.
- The worker has no health endpoint, since it binds no port. Its liveness signal is process
  existence plus consumer activity; if [ADR-0038](./adr-0038-observability-stack-as-attached-backing-service.md)
  lands, queue depth and consumer lag become the meaningful alerting signals. Until then, the
  worker's operational visibility is weak — which is a reason to sequence ADR-0038 and
  [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md) ahead of this one.
- The worker's log output has the same problem as the API's — `src/worker.ts` uses the same Winston
  logger that writes to files in production. Deploying it before ADR-0041 lands would create a
  second process whose logs are discarded.

## Links

- [`audit-2026-08-17.md`](../../internal/audits/twelve-factor/audit-2026-08-17.md) § Factor VIII (TF-4)
- [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md) — one artefact, two start
  commands depends on the artefact existing
- [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md) — should land first; otherwise this
  deploys a second process with no usable logs
- [ADR-0004](./adr-0004-use-amqp-connection-manager.md),
  [ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md),
  [ADR-0006](./adr-0006-separate-publisher-and-consumer-connections.md),
  [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md) — the queue design this gives a
  home to
- `src/worker.ts:51-68` — the drain-before-close shutdown that has never run in a deployed environment
- `package.json:13-15` — `worker`, `worker:dev`, `worker:staging`
- [`c4-containers.md`](../architecture/c4-containers.md) — the diagram this corrects
