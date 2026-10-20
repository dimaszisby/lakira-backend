# Floating promises and bounded shutdown — Plan

- **Status:** In progress
- **Appetite:** 2 days
- **Date:** 2026-10-20

## Context and goals

Two register rows. Checked on `dev` at `505a851`:

- **B-37** — nothing enforces ADR-0054's rule that work nobody awaits goes through
  `runInBackground`. The two call sites behind audit finding R3 were found by reading.
- **B-38** — `shutdown()` in `src/server.ts` awaited `server.close()` with no bound, so one stuck
  connection kept the drain, the database close and the log flush from ever running. A second
  signal, or an uncaught error during shutdown, started a second run that exited while the first
  was still draining. `src/worker.ts` had the same shape, and its consumers drained for up to 30 s,
  past Docker's 10 s stop grace.

Run with both rules on, ESLint reported six lines in the whole repository: the two signal
handlers, `startServer()`, `connectRedis()`, and `main()` in both schemathesis scripts. None was a
lost promise in request handling.

When this lands, a promise nobody awaits fails lint, and each process exits within one deadline
whatever it is waiting on.

## Acceptance criteria

- **AC-1** — `npm run lint` fails on an unawaited promise or a promise passed where a void return
  is expected, in any linted file; a test proves both rules fire, and that `void` and `await` pass.
  _Why:_ the next R3 is caught by a machine.
- **AC-2** — every `void` added by the sweep carries a one-line reason.
  _Why:_ a `void` with no reason is the same bare promise, quieted.
- **AC-3** — a second `shutdown` call in either process returns the first call's promise and runs
  no step again; a later crash makes the exit code non-zero.
  _Why:_ the second run cut the first one's drain short without a log line.
- **AC-4** — with a connection held open, the server still reaches the drain, the database close
  and the log flush, and exits.
  _Why:_ B-38 item 1.
- **AC-5** — whatever hangs, each process exits by `SHUTDOWN_TIMEOUT_MS` with an error line saying
  the deadline passed.
  _Why:_ a hang ends in an exit the logs explain, not a SIGKILL they do not.
- **AC-6** — the image still stops cleanly on SIGTERM.
  _Why:_ image smoke step 6.

## Open questions

None.

## Out of scope

Making the deadline configuration (an ADR of its own, `configuration.md` and envManager
validation; nothing asks for it until the ADR-0042 VPS grace period is settled). B-33.

## Decisions expected

D-01 the rules and their scope; D-02 one shutdown helper for both processes; D-03 the budget.

## Phases

### Phase 0 — kit and branch

### Phase 1 — tests first, each seen to fail

### Phase 2 — the rules, the helper, the sweep

### Phase 3 — gates, review, docs

## Risks and trade-offs

A worker message cut short at the 20 s drain is not acked and is redelivered; ADR-0073's dedup
records it per queue, so the side effect does not repeat once it has completed.

## Rollback

Code: revert the PR. No migration, no configuration.

## References

- ADR-0076; ADR-0054; ADR-0073
