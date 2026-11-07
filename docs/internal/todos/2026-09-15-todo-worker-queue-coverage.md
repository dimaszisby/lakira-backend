# Todo — give the worker a home locally and in CI

- **Status:** Complete (2026-09-15) — delivered by `85b4e77` (#86)
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

---

## Review — 2026-09-15

**Status:** Done on `feat/worker-queue-coverage` (off `origin/dev` 91fbdc9). Not committed. The
three infrastructure files are handed over as a patch; see _Protected files_ below. _(Later: merged
as #86, `85b4e77`, patch included — added 2026-09-24.)_

### The trap: the existing tests stay on the fallback path

The four tests at `metric-log.test.ts:199-240` keep running the synchronous fallback. In test
`RABBITMQ_ENABLED=false`, so `server.ts:55` wires `NoopMessageQueue`. Test 1's name claimed
"inserts logs synchronously" but it asserted only the 202. It is now
`returns 202 with a jobId and writes the logs synchronously when the queue is disabled` and
asserts `MetricLog.count === 5` straight after the response, with no polling. The other three
(404 ownership, 401, 400) fail before the branch at `GenerateDummyMetricLogs.ts:41`, so they are
path-independent and their names stay.

### The queued path: `GenerateDummyMetricLogsQueue.integration.test.ts`

The consumer runs in-process (option 1), built exactly as `worker.ts:37-46` builds it, against a
real broker. It is driven through the real `POST /metric-logs/:metricId/dummy` route via
`overrideMetricLogFeatureForTest`. The only test seam is a `MessageQueuePort` whose
`isEnabled()` returns `true` and whose `publish`/`close` delegate to the real `RabbitMQPublisher`.
`env` cannot be mutated in tests, and exchange, routing key, payload and messageId all still come
from the use case.

- **Test A** asserts, in order:
  1. no foreign consumers;
  2. after the 202, the job is routed to the queue (depth 1) with **0 rows**, which is the
     built-in negative;
  3. starting the consumer produces 5 rows;
  4. after `close()` drains, the main queue and the parking lot both have depth 0, which proves an
     ack (a nack would dead-letter, and a missing ack would requeue).
- **Test B** publishes a job naming a non-owner. The handler rejects it, the message reaches the
  parking lot, and there are 0 rows. This exercises the DLX binding for the first time.
- **Flakiness controls:**
  - every wait is a bounded poll (10s timeout, 50ms interval);
  - `connect({ timeout })` fails fast when there is no broker;
  - both queues are purged before each test;
  - broker lifecycle is owned by the file, so `jest.setup.ts` is unchanged.

### Verification (exit codes captured into a variable, never through a pipe)

| Check                                                | Result                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| lint / typecheck / format:check / docs:openapi:check | 0 / 0 / 0 / 0; 46 operations validated                                                                                 |
| `npm test`                                           | 0. Unit 556/556; integration 184 passed, 5 skipped (existing `ENABLE_REDIS_INTEGRATION` guards)                        |
| New file, 5 consecutive runs                         | 5× exit 0, 2/2 each, 436–502 ms per test. No flake                                                                     |
| Mutation M1: consumer never started                  | exit 1: `Timed out … waiting for the consumer to write 5 rows; last observed: 0`                                       |
| Mutation M3: port reports disabled (sync fallback)   | exit 1: `Timed out … waiting for the job to be routed to the queue`. The test cannot pass via the fallback             |
| Compose worker (`--profile worker up -d --no-deps`)  | Up, 0 restarts, `[RABBITMQ] Consumer registered.` after ~6s; queue carries `x-dead-letter-exchange`                    |
| Queue test with the worker attached                  | exit 1 in ~0.2s: `1 other consumer(s) are attached … docker compose stop worker`                                       |
| Worker stopped and removed, test rerun               | 0 consumers, 0 messages; exit 0, 2/2                                                                                   |
| Patched Compose files / CI YAML                      | `docker compose config` 0 for both; worker absent from default services; CI `tests` job parses with `rabbitmq` service |

One reading was falsely green along the way, from my own mistake: `echo "… $(basename $M) exit=$?"`
reports `basename`'s status, not Jest's. That first mutation round printed `exit=0` over a FAIL.
It was re-run with `rc=$?` captured immediately, which gives the results above. M3's first attempt
also did not compile, because a `//` comment swallowed a comma. It showed "0 total", which proves
nothing, and was redone.

### Decisions and divergences

- **The worker is opt-in** (`profiles: ["worker"]`, user's decision), so the brief's
  `docker compose up -d` becomes `docker compose --profile worker up -d`. Locally nothing publishes,
  since `app` keeps `RABBITMQ_ENABLED=false`. A default-on worker would also share the broker,
  vhost and queue with the integration test and consume its messages. The precondition turns that
  collision into an immediate, explained failure.
- **The real log line** is `[RABBITMQ] Consumer registered.`; the brief says `[WORKER] …`.
- **CI:** a `rabbitmq:3.13-management-alpine` service container in `tests` only, with no env
  changes. The defaults match, and the image sets `loopback_users.guest = false` (verified).
  `contract_local` is untouched, so operation count 46 and the Schemathesis selection are
  unaffected.
- **`test:ci`:** `scripts/test-ci.sh` starts `rabbitmq`, and `docker-compose.test.yml` points the
  test app at it. **Not run**: its `down -v` combines both Compose files, so it would also delete
  the development-named volumes (`db_data_volume`, `rabbitmq_data_volume`). That hazard predates
  this work and deserves its own ticket.

### Protected files

`.claude/hooks/protect-files.sh` blocks Edit/Write on `docker-compose*.yml` and
`.github/workflows/*.yml` unconditionally. The changes to `docker-compose.yml`,
`docker-compose.test.yml` and `backend-ci.yml` were approved, then built and verified as scratch
copies (`config`, image build, the worker run above). They are handed over as a patch that passes
`git apply --check`, so the user applies them.

### Found, not fixed (out of scope)

- **ADR-0007 is Accepted but not implemented.** There is no `processed_messages` table, and
  `GenerateDummyMetricLogsHandler` is not idempotent, so a redelivery duplicates rows. _(Since
  fixed: #88, `9ebaee9`.)_
- **`RABBITMQ_MAX_RETRIES` is unused.** The consumer reads `x-retry-count` only to log it, and every
  failure goes straight to the parking lot. _(Since fixed: #91, `5952b74`.)_
- Production deployment (ADR-0040), queue-depth observability (ADR-0038) and parking-lot
  monitoring remain open, as the brief scoped.
