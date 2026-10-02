# Todo — shutdown has no overall bound and no re-entry guard

- **Status:** Open (P3)
- **Created:** 2026-10-02
- **Owner:** unassigned
- **Origin:** review of kit `drainable-background-work`; recorded in ADR-0054 § Consequences

---

## What

Two weaknesses in `shutdown()` in `src/server.ts`. Both predate ADR-0054; its drain makes them
easier to see.

1. **`server.close()` is awaited with no bound.** It waits for open connections to finish, and
   only idle keep-alive connections are dropped. One stuck connection means the background-task
   drain, the database close and the log flush are never reached, and the process sits until the
   platform sends SIGKILL.
2. **`shutdown` can run twice.** A second signal, or an uncaught exception during shutdown, starts
   a second run that closes the connections and calls `process.exit` while the first is still
   draining or closing, so the first run's drain is cut short without a log line.

`src/worker.ts` has the same shape.

## Suggested fix

Give the whole shutdown one deadline (close the server, then `closeAllConnections()` when it
passes), and make a second call return the first call's promise instead of starting over. Decide
the deadline together with the platform's stop grace period once the ADR-0042 VPS layout is
settled. Lean kit; an ADR if the deadline becomes configuration.
