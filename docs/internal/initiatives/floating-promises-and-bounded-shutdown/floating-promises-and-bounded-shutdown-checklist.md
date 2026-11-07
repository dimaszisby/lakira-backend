# Floating promises and bounded shutdown — Checklist

## Phase 0 — kit and branch

- [x] `fix/floating-promises-and-bounded-shutdown` cut with `--no-track` from `origin/dev` at
      `505a851`; HEAD and upstream verified
- [x] `README.md`, the plan, this file, `decisions.md` with D-01 to D-03

## Phase 1 — tests first, each seen to fail

- [x] `__tests__/unit/promise-rules.lint.test.ts` — fixtures under `tmp/` linted by the CLI, one
      `.ts` and one `.js`: a bare call and a promise-returning `process.on` callback reported;
      `await`, `void` and `.catch` not. With the rules off, both cases failed in both files
- [x] `__tests__/unit/utils/shutdown.test.ts` — `createShutdown` (8 cases) and `closeHttpServer`
      (2 cases): failed, the module did not exist
- [x] `__tests__/unit/shared/infrastructure/queue/RabbitMQConsumer.test.ts` — `close(ms)` passes
      `ms` to `drain`: failed, `close` took no argument

## Phase 2 — the rules, the helper, the sweep

- [x] `eslint.config.mjs` — both rules at `error` in the base block (D-01)
- [x] `src/utils/shutdown.ts` — `createShutdown`, `closeHttpServer`, `SHUTDOWN_TIMEOUT_MS`,
      `HTTP_CLOSE_TIMEOUT_MS`, `WORKER_DRAIN_TIMEOUT_MS` (D-02, D-03)
- [x] `src/shared/infrastructure/queue/RabbitMQConsumer.ts` — `close(drainTimeoutMs?)`
- [x] `src/server.ts`, `src/worker.ts` — steps handed to `createShutdown`; signal handlers `void`
      with a reason; `startServer()` `void` with a reason
- [x] `src/utils/redis-client.ts` — `connectRedis()` `void` with a reason
- [x] `tests/contract/schemathesis/scripts/run-local.js`, `run-staging.js` — `main().catch(...)`
      setting `process.exitCode = 1`
- [x] `docker-compose.yml` — `stop_grace_period: 30s` on the app and the worker

## Phase 3 — gates, review, docs

- [x] Review of the whole diff; findings below
- [x] ADR-0076 (Proposed), its registry row, next free number 0077; D-01 to D-03 collapsed to
      pointers; `CLAUDE.md` counts 76
- [x] ADR-0054 status note pointing at ADR-0076 for its shutdown-gap consequence (the ADR-0005
      precedent)
- [x] `.claude/rules/architecture.md` § Post-response work — the rule paragraph
- [x] both todos closed; register rows B-37, B-38 to Closed naming the branch
- [x] #195's loose ends: ADR-0075 Accepted (file and row); `query-values-mean-what-they-say`
      README Done and its ADR Accepted, plan Done; B-43 to B-46 name `#195 (505a851)`; the three
      todos name #195; register "As of" `505a851`

## Discovered

- [x] Found: `main()` in `run-local.js` does work outside its `try`, and its `catch` awaits a write
      that can throw, so `void` would have hidden a failure → in scope, both scripts get a
      `.catch` that sets the exit code (D-01)
- [x] Found: TypeScript leaves a `.js` file out of the program when a `.ts` file of the same
      basename exists, so the first JS fixture was never linted → in scope, distinct basenames
- [x] Found: `feature-boundaries.lint.test.ts` lints with `project:false`, and ESLint refuses to
      load a typed rule without type information; all 62 of its cases failed in the first
      `test:coverage` run → in scope, that test switches the two rules off for its run
- [x] Found in review: a rejected log flush left `run` rejected before `exit` and before the
      deadline timer was cleared, so the process would hang to SIGKILL → in scope, the flush is
      caught, `exit` sits in a `finally`; test "still exits when the log flush fails", seen to fail

## Acceptance

- [x] AC-1 — `promise-rules.lint.test.ts`, both cases, `.ts` and `.js`; `npm run lint` reported
      the six sites before the sweep
- [x] AC-2 — each `void` the sweep added, in `src/server.ts` (2), `src/worker.ts` (1) and
      `src/utils/redis-client.ts` (1), has its reason above it. The `void`s already there (the
      uncaught-error handlers, `catch-async.ts`) are unchanged
- [x] AC-3 — `shutdown.test.ts` › second call returns the first call's promise; › crash during a
      graceful shutdown exits non-zero. Live: two SIGTERMs to the built server gave one
      "Already shutting down" line and one cleanup
- [x] AC-4 — `shutdown.test.ts` › `closeHttpServer` closes a connection still open at the bound.
      Live: with a partial request held open, the built server warned at 5 s, closed the database
      and Redis, and exited 0 after 5 s
- [x] AC-5 — `shutdown.test.ts` › exits 1 at the deadline when a step never settles; › even when
      the log flush never settles
- [x] AC-6 — image smoke step 6, exit 0

## Gates

- [x] typecheck
- [x] lint
- [x] format — named files only; `format:check` also clean
- [x] tests — `test:coverage`: unit 1437 passed; integration 283 passed, 5 skipped; thresholds met
- [x] build
- [x] image smoke — all 7 checks passed
- [ ] OpenAPI — skipped: no route, Zod schema or `src/lib/openapi/**` touched
- [ ] security delta — skipped: no dependency change

## Review

Read the whole diff against `dev`. One defect, fixed (Discovered, last item). Considered and left:

- A crash during a graceful stop does not stop the drain already running; it only makes the exit
  code non-zero. The steps get the first call's code, as before.
- After the deadline, the abandoned steps keep running until `exit`; nothing awaits them.
- `startServer`'s own failure path calls `process.exit(1)` without the helper. Unchanged, and out of
  this kit's rows.
