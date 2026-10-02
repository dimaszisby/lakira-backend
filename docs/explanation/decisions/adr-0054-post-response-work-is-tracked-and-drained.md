# ADR-0054 — Post-response work is tracked and drained

- **Status:** Accepted
- **Date:** 2026-10-02
- **Related:** audit finding R3 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6);
  `.claude/rules/architecture.md` § Post-response work; `.claude/rules/testing.md` § Integration
  Test Setup
- **Origin:** `D-01` to `D-05` in the drainable-background-work kit —
  [`drainable-background-work`](../../internal/initiatives/drainable-background-work/decisions.md)

---

## Context

`POST /auth/register` and `POST /auth/resend-verification` answer before the verification email is
sent: the handler started `requestEmailVerification.execute(...)` and did not await it. The promise
was held by nothing, so nothing could wait for it:

- **In tests** it outlived the request. The next test's `TRUNCATE ... CASCADE` deadlocked with the
  still-running insert into `email_verification_tokens`, and Postgres killed the `TRUNCATE`
  (confirmed in the database log on 2026-09-29). The suite failed about one run in six, in whatever
  test happened to follow.
- **On shutdown** the server closed its HTTP listener and then the database. A SIGTERM just after a
  registration dropped the email, or ran the insert against a closed pool.
- **Tests waited by guessing**: a polling loop for the email, and a fixed one-second sleep to
  assert that none was sent.

The cache middleware had the same shape: it writes to Redis after handing the response back.

## Decision

1. **Work started after the response goes through `runInBackground(label, task, meta)`**
   (`src/utils/background-tasks.ts`), never a bare promise. It keeps the promise until it settles.
   A rejection or a synchronous throw is logged once, with the label, the error message and stack,
   and the caller's metadata, and never propagates. The verification email in `register` and
   `resendVerification` and the cache write in `cacheMiddleware` all use it.
2. **`drainBackgroundTasks(timeoutMs?)` waits for all of it**, including work started while it is
   waiting. With a timeout it gives up at the deadline, warns naming what is still running, and
   returns how many tasks it left.
3. **Shutdown drains** after the HTTP server has closed and before the database, Redis and
   RabbitMQ close, for at most `SHUTDOWN_DRAIN_TIMEOUT_MS` — a constant, 10 seconds.
4. **A crash does not drain.** On the uncaught-exception and unhandled-rejection paths the process
   state is unknown, so shutdown skips the drain and exits promptly, as it did before.
5. **The integration setup drains** before truncating tables and before closing Sequelize, and a
   test that needs the email waits with `drainBackgroundTasks()`, not a sleep.
6. **The tracker is a plain module in `src/utils/`**, not a port: every caller is infrastructure
   (an HTTP controller, an HTTP middleware, the server's shutdown, the test setup).

## Options considered

- **Await the email in the handler.** Rejected: it adds the email provider's latency to
  registration and turns the provider's outage into a registration outage.
- **Publish to RabbitMQ and send from the worker.** Rejected for this change: `RABBITMQ_ENABLED` is
  optional, so the in-process path would have to remain, and it is far larger than the defect. It
  is the durable answer and is tracked in
  `docs/internal/todos/2026-10-02-todo-durable-email-delivery.md`.
- **Fix only the tests**, by having the setup poll the database before truncating. Rejected: it
  hides the flake and leaves shutdown as it was.
- **A drain timeout from an env var.** Rejected: no deployment needs a different value yet. Ten
  seconds is Docker's default stop grace period; the queue consumer's 30 seconds would outlast it.
- **Leave the cache write untracked.** Rejected: the rule would have an exception from its first
  day, and shutdown would close Redis under an in-flight write.

## Consequences

- **Not durable.** The work lives in memory. SIGKILL, a crash, or a drain timeout loses it, and a
  failed send is logged, not retried. The user asks for the email again.
- **Shutdown can take up to 10 seconds longer** when a task hangs. The warning names it.
- **The 10 seconds bounds the drain, not shutdown.** `server.close()` is awaited first with no
  bound of its own, and `shutdown` has no guard against running twice; both predate this decision.
  A platform whose stop grace period is shorter than the server close plus the drain can still
  kill the process mid-drain. Tracked in
  `docs/internal/todos/2026-10-02-todo-shutdown-hardening.md`. The Compose files set no
  `stop_grace_period`, so Docker's 10 seconds applies.
- **Failure log lines changed.** "Failed to send verification email after registration", "Failed
  to resend verification email" and "[CACHE ERROR] Cache write failed: …" are now
  `[BACKGROUND] Task failed: <label>: <message>`, with labels `verification-email:register`,
  `verification-email:resend` and `cache-write`. Nothing in the repo matched the old strings; an
  external alert that did must be updated.
- **Nothing enforces the rule.** A new bare promise in a request path would bring the defect back.
  A `no-floating-promises` lint is tracked in
  `docs/internal/todos/2026-10-02-todo-no-floating-promises-lint.md`.
- **The API is unchanged**: same responses, same latency contract, no OpenAPI change.

## Links

- Kit: `docs/internal/initiatives/drainable-background-work/`
- Tracker: `src/utils/background-tasks.ts`
- Shutdown: `shutdown()` in `src/server.ts`
- Test setup: `jest.setup.ts`
