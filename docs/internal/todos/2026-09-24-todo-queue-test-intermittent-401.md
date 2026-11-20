# Todo — intermittent 401 on register inside the RabbitMQ queue integration test

- **Status:** Closed on 2026-11-20 by #252: the 401 came from another process, the mechanism
  of #243, fixed by #303 (see the last section). Before: Issue #252 (was register row B-54),
  seen once, not reproduced
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

## 2026-11-20 — explained and closed

**Cause.** The mechanism of #243 (see
[`2026-09-25-todo-integration-parse-error-flake.md`](2026-09-25-todo-integration-parse-error-flake.md)).
`createTestUser` sent the register through the shared `api = request(app)`, so supertest started a
server for that one request with `listen(0)` and no host, and sent the request to `127.0.0.1`. On
macOS that listen can be given a port another process holds on `127.0.0.1` alone, and the request
then reaches that process. Its 401 with no body is what the test read: supertest gives `{}` for a
body that is empty or not JSON.

**Why not the app.** The app could not have answered `401 {}` on register, on 2026-09-24 or now:

- The register chain then was `requireJsonObjectBody`, `validate`, `register`; now it is
  `registerIpRateLimiter` ahead of those three. Neither has `authMiddleware`, so X61 (#200), named
  above as the likely mask, could not have produced it.
- `RegisterUser` raises no unauthorized error.
- Every error the app answers is its JSON envelope, which supertest would have parsed.

**The shape, reproduced.** A loopback-only HTTP server answering 401 with no body, and a listen on
its port with no host, as supertest made before #303: the register POST read status 401 and body
`{}`, five times in five. Through `__tests__/helpers/request.ts` the same POST reached the app
(201), and a loopback listen on the held port was refused with `EADDRINUSE`.

**Runs.** Five full `npm run test:integration` runs on `dev` at `21a7390` (after #303), on macOS with
the audit containers' loopback ports held: 328 passed and 7 skipped each, and "acks and skips a
redelivered message with the same messageId" passed in all five. The #303 gate ran three more on
the same code.
