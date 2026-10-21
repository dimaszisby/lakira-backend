# Queue failure paths — Checklist

Checked against `origin/dev` at `5a3addb` (#202).

## Phase 0 — kit and branch

- [x] `fix/queue-failure-paths` cut with `--no-track` from `origin/dev` at `5a3addb`; HEAD and
      upstream verified
- [x] This kit: README, plan, this file, `decisions.md` with D-01 to D-04
- [x] Register D-10: B-78 with B-84

## Phase 1 — tests first, each seen to fail

- [x] Queue suites' broker connect (AC-7): `__tests__/integration/helpers/broker.ts`, used by the
      six suites that called `connect({ timeout })`. With `RABBITMQ_ENABLED=true` the old harness
      failed 12 of 12 in `GenerateDummyMetricLogsQueue`; the new one passes with the flag on and
      off
- [x] Unit: `RabbitMQPublisher.test.ts` (X63, X64, N4) and `RabbitMQConsumer.test.ts` (X63, N4),
      five tests failed; the three use cases' X68 tests failed to compile (no `QUEUES` in
      `job-routes.ts`); `__tests__/unit/worker/worker-shutdown.test.ts` (X66, X67) had no module
- [x] Integration, Postgres: `fallback-sends-once.integration.test.ts`, six tests, three emails
      with the fallback first and the worker first. On the old code every one sent twice
- [x] Integration, RabbitMQ: `failure-paths.integration.test.ts`. On the old code the setup
      failure was an unhandled `error` that took the connection down; an unroutable publish
      resolved; the handler saw no request id
- [x] Architecture: `architecture.test.ts` › an entry point flushes its logs before it exits.
      Failed naming `server.ts:125` and `worker.ts:20`

## Phase 2 — the fix

- [x] `RabbitMQPublisher.ts`: `error` and `connect` listeners and `isEnabled()` (D-01);
      `UnroutableMessageError` from returned ids (D-02); `x-request-id` from the request's store
      (N4); a returned id dropped when its publish fails anyway
- [x] `RabbitMQConsumer.ts`: `error` listener; the handler runs under the message's request id
- [x] `RabbitMQConnection.ts` `absorbChannelErrors`, called first by both setups (Discovered)
- [x] `job-routes.ts` `QUEUES`; `topology.ts` re-exports it; `request-id.ts` names the header once
- [x] `ScheduleEmailVerification`, `RequestPasswordReset`, `InviteUserToOrganization` and
      `auth/feature.ts`: a failed publish runs the job through `runOnce` under its id (D-03)
- [x] `src/worker-shutdown.ts` (D-04, X66); `worker.ts` and `server.ts` flush before exiting (X65)

## Phase 3 — gates, review, docs

- [x] Built server, throwaway broker, the verification queue declared with another dead-letter
      exchange: the API stays up, logs the channel failure once, answers 201 to a registration and
      sends the email in process; SIGTERM exits 0
- [x] Built worker: SIGTERM closes consumers, RabbitMQ, Redis ("Redis client disconnected") and
      the database, exit 0; with the queue off it prints why and exits 1
- [x] Review of the diff. Found and fixed: a message returned and then timed out left its id in the
      publisher's set; queue log lines printed every routing key as `***REDACTED***`, because the
      metadata key `routingKey` ends in "key" (now `route`)
- [x] ADR-0080; ADR README row and next number; CLAUDE.md count 80; `.claude/rules/architecture.md`
      § Post-response work
- [x] Register: B-78 and B-84 to Closed; D-10; the B-78 todo closed; "As of" `5a3addb`
- [x] B-54 rechecked: the queue suite it was seen in passed five runs in a row with the queue flag
      off, as CI runs it, and once more in the full queue run, with no 401. Left open, with the
      result, for the owner or the dated run to close
- [x] #202's loose ends: register D-09 Accepted; B-79's Closed row and todo name `#202 (5a3addb)`;
      `metric-log-stats-in-sql` README Done

## Discovered

- [x] Found: the broker closes a channel whose declaration fails, amqplib emits `error` on the raw
      channel, and `amqp-connection-manager` listens only for its `close`; the throw took the whole
      connection down → in scope, `absorbChannelErrors` (D-01's text says so)
- [x] Found: `AmqpConnectionManager.connect()` on a connection already up waits forever, so with
      `RABBITMQ_ENABLED=true` locally every queue suite timed out. CI, with the flag off, was not
      affected → in scope, `awaitBroker`
- [x] Found: the production-guard unit tests read `RABBITMQ_USER`/`RABBITMQ_PASSWORD` from the
      process, so a gate run must not export the throwaway broker's login → not a defect; the unit
      gate ran without them
- [x] Found: no Notion record is owed. No HTTP route, status or body changes; a duplicate email no
      longer goes out

## Acceptance

- [x] AC-1 — › survives a channel whose setup fails, and reports the queue unavailable (connection
      still up); the built-server run above
- [x] AC-2 — › rejects a publish that nothing routes; › rejects a publish the broker returned as
      unroutable
- [x] AC-3 — `fallback-sends-once.integration.test.ts`, six tests
- [x] AC-4 — › server.ts / worker.ts awaits flushLogs() before every process.exit
- [x] AC-5 — › drains the consumers on a clean stop, then closes everything it opened, Redis
      included; › closes the consumers without draining after a crash
- [x] AC-6 — › carries the request id from the publisher to the handler; › runs the handler under
      the message's request id, and mints one for a bad id
- [x] AC-7 — all 46 queue tests pass with `RABBITMQ_ENABLED` false and true

## Gates

Node 24.22.0 (checksum verified); throwaway `postgres:18`, `redis:7-alpine` and
`rabbitmq:3.13-management-alpine` on 55432, 56379 and 55672, with every URL variable pinned.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 148 suites, 1516 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 299 tests passed (6 skipped),
      thresholds met
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean (no route change)
- [x] image smoke — `npm run docker:smoke`: all 7 checks passed
- [ ] security delta — skipped: no dependency added, upgraded or removed
