# Todo — give the worker a home locally and in CI

- **Status:** Ready to start — this is the brief, not a plan
- **Created:** 2026-09-15
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session — **Opus, high effort, plan mode**
- **Origin:** `TF-4` and `TF-10` in the twelve-factor audit
  ([`audit-2026-08-17.md`](../audits/twelve-factor/audit-2026-08-17.md)), unparked by
  [ADR-0042](../../explanation/decisions/adr-0042-vps-compose-deployment-topology.md), Accepted
  2026-09-15

---

## What is actually wrong

`src/worker.ts` has never run in any environment. Not "runs but isn't deployed" — **never
executed**, in development, test, CI, or staging.

```
RABBITMQ_ENABLED        defaults to false        zodEnv.ts:228
.env.example            RABBITMQ_ENABLED=false
worker.ts:16-21         process.exit(1) when false
docker-compose.yml      no worker service
backend-ci.yml          no worker job, no rabbitmq service container
```

Everything downstream of that is therefore also unexercised: `RabbitMQConsumer`, `assertTopology`,
the dead-letter binding to the parking-lot exchange, `RabbitMQPublisher`, and
`GenerateDummyMetricLogsHandler`. All of it typechecks. None of it has moved a message.

RabbitMQ _is_ already a Compose service with a healthcheck (`docker-compose.yml:59-85`), so the
broker runs locally today with nothing connected to it.

### The part that makes this worth doing now rather than later

`GenerateDummyMetricLogs` has **two behaviours behind one endpoint**
(`application/use-cases/GenerateDummyMetricLogs.ts:41-53`):

```ts
if (this.queue.isEnabled()) {
  await this.queue.publish(EXCHANGES.JOBS, { jobId, userId, ... });
  return { jobId };
}
// Sync fallback when queue is disabled (development / tests)
for (let i = 0; i < count; i++) { await models.MetricLog.create({ ... }); }
```

Every test in the suite runs the **fallback**. The queue branch — the one production would use — has
no coverage at all. The existing integration test is honest about it; its name is
_"returns 202 with a jobId and inserts logs synchronously (queue disabled)"_
(`__tests__/integration/api/metric-log.test.ts:200`).

So the risk is not that a deployment is missing a process. It is that an entire execution path is
one config flag away from going live having never run.

## THE TRAP: the HTTP response is identical either way

Both branches return `202` with `{ jobId }`. The four existing tests at
`__tests__/integration/api/metric-log.test.ts:199-240` assert only on the response, so **enabling
the queue will not fail them — it will make them silently stop testing what their names claim.**
The rows they imply are written would instead be written asynchronously by a worker, or not at all
if no worker is running.

That is the single most important thing to get right here. A green suite after this change does not
mean the change worked. Decide deliberately, and say which you chose:

- keep the existing tests on the fallback path and add new ones for the queue path, or
- move them to the queue path and assert on eventual row creation instead.

Renaming that test to match whichever branch it actually exercises is not optional.

## Scope

**1. A `worker` Compose service.** Mirror the `app` service (`docker-compose.yml:87-127`): same
build context, same `env_file: .env`, same `depends_on` health conditions, `command` running the
worker, and `RABBITMQ_ENABLED: "true"` in its `environment:` block. Note the existing comment at
`:98-103` explaining why `environment:` overrides `env_file:` — the same reasoning applies.

Leave the `app` service's `RABBITMQ_ENABLED` alone unless you argue for changing it. Turning it on
flips the API's dummy-generation path from synchronous to queued for every local developer, which is
a behaviour change disguised as configuration.

**2. RabbitMQ in CI.** Add a service container to the `tests` job (`backend-ci.yml:127-151`),
alongside `postgres` and `redis`. `rabbitmq:3.13-management-alpine` to match Compose, with a
healthcheck — `rabbitmq-diagnostics -q ping` — and the ports the tests need.

**3. A test that proves publish → consume → persist.** This is the real work, and where the effort
budget goes. It must assert that a message published to `EXCHANGES.JOBS` with routing key
`metric-log.generate-dummy` results in rows in `metric_logs`, written **by the consumer**.

**Out of scope:** the production deployment of the worker (that is ADR-0040, still Proposed and
still written against Render — it needs rewriting against ADR-0042 first), the observability of
queue depth (ADR-0038), and the parking-lot monitoring that `topology.ts:37` describes but nothing
implements.

## The design question worth the plan-mode pass

Three ways to run the consumer during an integration test, and they are not equally good:

1. **In-process.** Construct `RabbitMQConsumer` inside the test, publish, poll for rows, then close
   the channel. No second process, straightforward teardown, and the consumer runs under the same
   Jest lifecycle. Risk: `jest.setup.ts` already owns server/DB/Redis lifecycle and runs
   `--runInBand`; adding a broker connection needs the same care, and a channel left open hangs the
   suite.
2. **Separate worker process**, spawned by the test or by Compose. Closest to production. Costs
   process management, log capture, and a readiness signal — the worker currently logs
   `[WORKER] Consumer registered.` but exposes no health endpoint.
3. **Handler-level**, calling `GenerateDummyMetricLogsHandler.handle(msg)` directly with a
   hand-built `ConsumeMessage`. Cheap, but proves nothing about topology, bindings, routing keys, or
   acking — which is most of what is currently untested.

(3) is the tempting one and the least valuable. (1) is the recommended starting point; reach for (2)
only if something about (1) proves it cannot represent the real path.

**Flakiness is the failure mode to design against, not to discover.** Message delivery is
asynchronous, so the test must poll for an outcome with a bounded timeout rather than sleeping a
fixed interval. A test that sleeps 500ms passes on a laptop and fails on a loaded CI runner, and a
flaky test in this suite would be worse than the coverage gap it closes — this repo has spent weeks
removing checks that could not fail, and a check that fails at random is the same disease.

## Conventions this repo expects

- **Plan mode** for anything 3+ steps (`.claude/rules/workflow.md`)
- Branch: `git checkout -b feat/worker-queue-coverage --no-track origin/dev`
- **Verify `git rev-parse --abbrev-ref HEAD` before committing** — a previous handover wrote a
  commit onto the wrong branch because it skipped this
- **Never blanket-stage**; name explicit paths (a `pre-commit` hook enforces it)
- Conventional Commits; message to `$(git rev-parse --git-dir)/COMMIT_DRAFT`, shown in chat, applied
  with `git commit -F`. No `Co-Authored-By` or Claude references
- The user opens PRs and merges — do not commit, push, or open PRs
- Record the outcome as a Review section appended to this file

## Verification

```bash
npm run lint && npm run typecheck && npm run format:check && npm run docs:openapi:check
npm test

docker compose up -d
docker compose ps          # worker must be running, not restart-looping
docker compose logs worker # expect "[WORKER] Consumer registered."
```

**Capture exit codes directly — `npm run x | tail` reports `tail`'s status, not npm's.** That
mistake produced four falsely-green readings in a recent session.

Then the check that carries the weight — **run the new test at least five times**:

```bash
for i in 1 2 3 4 5; do npm run test:integration -- -t "<new test name>"; done
```

Five identical passes is the minimum bar for an async test. One flake here is a design problem, not
an infrastructure hiccup, and should send you back to the design question above rather than to a
longer timeout.

Also confirm the negative: with the worker stopped, the same published message must leave the rows
absent. A test that passes whether or not the consumer is running proves nothing — this is the
queue-path equivalent of the error components that validated `{}`.
