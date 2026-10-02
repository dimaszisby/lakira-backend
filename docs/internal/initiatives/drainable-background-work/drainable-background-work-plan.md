# Drainable Background Work — Plan

- **Status:** Done
- **Appetite:** 1 day — past that, cut scope rather than extend (first cut: D-03, the cache write)
- **Date:** 2026-10-02

## Context and goals

Audit finding R3 (P2), `docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6, action item 5
in § 9. Two handlers in `src/features/shared/auth/infrastructure/http/controller.ts` start the
verification email without awaiting it and respond at once: `register` and `resendVerification`.
Nothing keeps a handle on that promise, so:

1. **Tests.** It outlives the request. The next test's `TRUNCATE ... CASCADE` in `jest.setup.ts`
   deadlocks with the still-running token insert. Confirmed in the Postgres log on 2026-09-29
   ([flake todo](../../todos/2026-09-25-todo-integration-parse-error-flake.md)).
2. **Shutdown.** `shutdown()` in `src/server.ts` closes the HTTP server, then the database, without
   waiting. A SIGTERM right after a registration can drop the email or run the insert against a
   closed pool.
3. **Timing-based tests.** `__tests__/integration/api/auth-verify.test.ts` polls for the email and
   sleeps a fixed 1000 ms to assert that none was sent.

When this lands, post-response work is registered with one tracker
(`src/utils/background-tasks.ts`) that shutdown and the integration setup both drain. The API still
responds before the email is sent.

## Acceptance criteria

- **AC-1** — After `POST /auth/register` returns 201, `drainBackgroundTasks()` resolves only once
  the verification-email task has settled; the same holds for `POST /auth/resend-verification`.
  _Why:_ R3: the work must be observable to be waited for.
- **AC-2** — The integration setup drains before every `TRUNCATE` and before closing Sequelize. A
  test that makes the email task slow passes; against the old controller the same test fails,
  because the drain returns while the task is still pending.
  _Why:_ the confirmed deadlock, and audit theme 7 "Test-DB isolation Partial".
- **AC-3** — `shutdown()` awaits background work after the HTTP server closes and before the
  database, Redis and RabbitMQ close, bounded by a timeout; on timeout it warns with the pending
  labels and carries on.
  _Why:_ R3: "outlives `sequelize.close()`, and a SIGTERM shutdown does not wait for it".
- **AC-4** — A failing or throwing background task is logged once with its label and never becomes
  an unhandled rejection, which would trigger `shutdown("Unhandled Rejection", 1)`.
  _Why:_ the old `.catch` gave this guarantee; the tracker must not lose it.
- **AC-5** — Register and resend still respond before the email is sent: status, body and OpenAPI
  spec are unchanged.
  _Why:_ the flake todo records awaiting the email as a product decision, not a test fix.
- **AC-6** — `auth-verify.test.ts` contains no polling loop or fixed sleep for the email.
  _Why:_ timing-based waits are what hid the race.
- **AC-7** — No bare post-response promise remains in the request paths of `src/` (register,
  resend, cache write), and the rule is written down.
  _Why:_ a tracker that one path bypasses is the same defect again.

## Open questions

None. There is no frontend impact (contract and behaviour are unchanged), so no Notion record.

## Out of scope

- Durable delivery: a queue or outbox for email. In-process tracking still loses work on SIGKILL
  or a crash. Filed as a todo.
- Awaiting the email in the handler: changes latency, a product decision.
- An ESLint `no-floating-promises` gate. Typed linting is available, but switching the rule on is
  a repo-wide sweep. Filed as a todo.
- The `Parse Error: Expected HTTP/` flake (R4): a different cause; it stays open.
- Restating the audit finding or the theme grade: only a dated run does that (ADR-002).
- The Compose stop grace period (`docker-compose*.yml` is protected); noted in the ADR.

## Decisions expected

- Track and drain in process, versus await in the handler, versus a queue (D-01)
- Shutdown drain timeout: constant versus env var (D-02)
- Whether the cache write joins the tracker (D-03)
- Where the module lives (D-04)

## Phases

### Phase 0 — Kit and branch

### Phase 1 — Tracker

`src/utils/background-tasks.ts`, a module-level set of pending tasks:

- `runInBackground(label, task, meta?)` starts `task()`, tracks it and removes it when settled. A
  rejection or a synchronous throw is logged once and never propagates. Returns `void`.
- `drainBackgroundTasks(timeoutMs?)` resolves when the set is empty, re-checking so that work
  started during the drain is awaited too. On timeout it warns with the pending labels and
  resolves. Returns the number of tasks abandoned.

### Phase 2 — Call sites

Controller (register, resend), `src/shared/middleware/cache.ts` (post-response `setEx`),
`src/server.ts` `shutdown()` (drain between `server.close` and `sequelize.close()`),
`jest.setup.ts` (drain before the truncate loop and in `afterAll`), and `auth-verify.test.ts`
(drain instead of polling). `src/worker.ts` is untouched: it has no post-response work and its
consumers already drain.

### Phase 3 — Verification beyond the gates

Five consecutive full integration runs with no `deadlock detected` in the Postgres log, and a
manual SIGTERM run against the built server.

### Phase 4 — Review, then fix

### Phase 5 — Docs

ADR-0054, the architecture and testing rules, the product requirements line on shutdown, the flake
todo, the audit trackers, and two carried loose ends from `register-rate-limiter`.

## Risks and trade-offs

- A hung task delays shutdown by up to the timeout. Bounded and logged.
- Draining in `beforeEach` is a no-op when nothing is pending, and it replaces 1000 ms sleeps, so
  the suite should get faster, not slower.

## Rollback

Code: revert-safe. No migration, no data shape, no env var, no dependency.

## Observability

Shutdown logs how many background tasks it is waiting for and, on timeout, a warning naming their
labels. A task failure logs its label plus the caller's metadata (`userId`). No email address or
token is logged.

## References

- `docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6 (R3), § 9 item 5
- `docs/internal/todos/2026-09-25-todo-integration-parse-error-flake.md`
- `src/shared/infrastructure/queue/RabbitMQConsumer.ts` `drain()` — the existing drain shape
