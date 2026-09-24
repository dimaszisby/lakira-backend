# Todo — intermittent 401 on register inside the RabbitMQ queue integration test

- **Status:** Open — seen once, not reproduced
- **Created:** 2026-09-24
- **Owner:** unassigned
- **Origin:** a gate run in the `docs-sweep` kit (a docs-only change, so not caused by it)

---

## What

One full `npm test` run failed a single integration test:

```
GenerateDummyMetricLogs via RabbitMQ › idempotency (ADR-0007)
  › acks and skips a redelivered message with the same messageId

Failed to create test user: 401 {}
  at createTestUser (__tests__/integration/helpers/test-utils.ts:42)
  at ownedJob (…/GenerateDummyMetricLogsQueue.integration.test.ts:119)
```

`POST /api/v1/auth/register` answered **401 with an empty body**. That shape is itself the clue:
this app answers every error with its JSON error envelope, so an empty-body 401 suggests that a
different process answered, or that the request never reached the app's handlers.

## What was checked

- The same suite, run alone five times in a row
  (`-- --runTestsByPath …/GenerateDummyMetricLogsQueue.integration.test.ts`): 10/10 each time.
- A second full `npm test` straight afterwards: 601/601 unit; 196 passed and 5 skipped integration.
- No listener was found on ports 4000–4099 after the runs. Only after, so something short-lived
  during the failing run is not ruled out.
- The Compose `worker` was not running (it is a known way to break this suite).

## Worth checking next time it appears

- Whether another process (a second test run, another session on the same machine) was bound to
  the integration server's port (`4000 + JEST_WORKER_ID`) at the time.
- Whether a stale `agent` in `test-utils.ts` (`request(app)`) can target a server another suite has
  closed.
