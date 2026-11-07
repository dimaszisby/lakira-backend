# ADR-0076 — A promise is awaited or handed off, and shutdown has one deadline

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** [ADR-0054](./adr-0054-post-response-work-is-tracked-and-drained.md) (post-response
  work is tracked and drained; its § Consequences recorded the shutdown gap this closes);
  [ADR-0073](./adr-0073-dedup-per-queue-and-retry-tiers.md) (a redelivered message is deduplicated)
- **Origin:** `D-01` to `D-03` in the floating-promises-and-bounded-shutdown kit —
  [`floating-promises-and-bounded-shutdown`](../../internal/initiatives/floating-promises-and-bounded-shutdown/decisions.md);
  register rows B-37, B-38

> **Status note (2026-10-21).** Decision 3's bound on the worker's drain held only in part until
> `worker-cancel-and-one-connection-per-job` D-01: `RabbitMQConsumer.cancel()` did not cancel, so
> the drain kept taking deliveries (audit 2026-10-20, X60). It now cancels on the channel that
> registered the consumer, and a reconnect during the drain does not consume again.

---

## Context

Checked on `dev` at `505a851`:

- ADR-0054 says work nobody awaits goes through `runInBackground`, never a bare promise. Nothing
  enforced it; the two call sites behind audit finding R3 were found by reading. Typed linting was
  already configured. Run with `@typescript-eslint/no-floating-promises` and
  `@typescript-eslint/no-misused-promises` on, ESLint reported six lines in the repository: both
  signal handlers, `startServer()`, `connectRedis()`, and `main()` in both schemathesis scripts.
- `shutdown()` in `src/server.ts` awaited `server.close()` with no bound. It waits for every open
  connection to end, so one stuck connection meant the background drain, the database close and
  the log flush never ran, and the process sat until the platform killed it.
- `shutdown()` could run twice. A second signal, or an uncaught error while shutting down, started
  a second run that closed the connections and called `process.exit` while the first was still
  draining, cutting the first short without a log line.
- `src/worker.ts` had the same shape. Its consumers drained in-flight messages for up to 30 s,
  past Docker's 10 s default stop grace period.

## Decision

1. **Both promise rules, at `error`, over every linted file.** In the base block of
   `eslint.config.mjs`, with their defaults. A promise is awaited, handed to `runInBackground`,
   given a `.catch` that handles the failure, or marked `void` with a comment saying why nothing
   awaits it. `__tests__/unit/promise-rules.lint.test.ts` proves both rules report, in a `.ts` and
   a `.js` file, and that `await`, `void` and `.catch` pass.
2. **One shutdown helper for both processes, run once.** `createShutdown` in
   `src/utils/shutdown.ts` takes the process's steps and returns `shutdown(reason, exitCode)`. The
   first call runs the steps; a later call logs that shutdown is already running and returns the
   first call's promise. A later call with a non-zero code makes the exit code non-zero; it never
   restarts the steps. A step that throws is logged and the exit code becomes 1. A failed log flush
   loses log lines, never the exit.
3. **One deadline for the whole shutdown, and a bound on each wait inside it.** Constants in
   `src/utils/shutdown.ts`:
   - `SHUTDOWN_TIMEOUT_MS`, 25 s, steps and log flush included. When it passes, shutdown logs an
     error saying so, flushes the logs for at most a second, and exits 1. It sits under Render's
     30 s shutdown delay.
   - `HTTP_CLOSE_TIMEOUT_MS`, 5 s. `closeHttpServer` closes the server and, when the bound passes,
     closes every connection still open, with a warning. Then comes the drain, ADR-0054's 10 s.
   - `WORKER_DRAIN_TIMEOUT_MS`, 20 s, passed to `RabbitMQConsumer.close`.
   - `docker-compose.yml` gives the app and the worker a 30 s `stop_grace_period`, so locally Docker
     does not kill either at its 10 s default before the deadline can act.

## Options considered

- _The rules over `src/**` only._ The sweep was six lines; the two outside `src` are the
  schemathesis scripts, where a rejected `main()` decides the exit code.
- _A custom rule that demands the comment on a `void`._ Not worth a rule for a handful of sites;
  the convention is in `.claude/rules/architecture.md` § Post-response work, and review holds it.
- _The guard and the timer written into each entry point._ Two copies to drift, and neither
  testable: both files start a process when imported.
- _The deadline as an environment variable._ The platform grace period is not settled (ADR-0042).
  Making it configuration needs its own record, `docs/reference/configuration.md` and `envManager`
  validation.
- _Everything under Docker's 10 s._ It would cut ADR-0054's drain.

## Consequences

- A connection still open 5 s into shutdown is cut. A client in the middle of a slow request at
  that point loses it.
- A worker message still in its handler at 20 s is not acked and is redelivered. ADR-0073 records
  each completed message per queue, so a side effect that finished is not repeated.
- A shutdown that hits the deadline exits 1, which the platform reports as a failed stop. The error
  line says the deadline passed.
- A test that lints without type information, as `feature-boundaries.lint.test.ts` does, switches
  the two rules off for its run: ESLint refuses to load a typed rule without it.

## Links

- Helper: `src/utils/shutdown.ts`; tests `__tests__/unit/utils/shutdown.test.ts`
- Entry points: `src/server.ts`, `src/worker.ts`
- Lint: `eslint.config.mjs`; `__tests__/unit/promise-rules.lint.test.ts`
