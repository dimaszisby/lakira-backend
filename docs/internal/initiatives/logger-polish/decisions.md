# Decisions — logger-polish

## D-01 — One declaration of the logger's default fields

- **Status:** Proposed
- **Date:** 2026-10-22

**Context.** `createLogger` sets `defaultMeta: { service: APP_NAME, release }`. `reduceLoggedErrors`
rebuilds the record for `logger.error(err)`, and puts the defaults back after an error argument has
overwritten them, writing `service` and `release` out by hand both times (U3). A field added to
`defaultMeta` would be missing from every record that carries an error.
**Decision.** A module constant, `DEFAULT_META`, is the logger's `defaultMeta` and what both
rebuilds spread.
**Options considered.** _Read `defaultMeta` off the logger instance:_ the format chain is built
before the logger exists, so the format would reach forward to it.
**Consequences.** A new default field is declared once and reaches every record.

---

## D-02 — A nested error keeps dropping its stack

- **Status:** Proposed
- **Date:** 2026-10-22

**Context.** U3 lists "an error nested in metadata loses its stack" as polish. ADR-0059 decision 4
says so on purpose: "An error nested in metadata keeps its `message` and not its `stack`."
**Decision.** No change. U3's item is closed as by design, citing the ADR.
**Options considered.** _Keep the nested stack:_ a stack is the error's file paths and, for a
database error, its masked message again; a nested error is context beside a line, not its
subject. Changing it reopens an Accepted decision for polish, with no incident behind it.
**Consequences.** An error that needs its stack in the log is passed as the call's error argument,
not inside a metadata object.

---

## D-03 — A thrown non-Error is named through `loggableErrorMessage`

- **Status:** Proposed
- **Date:** 2026-10-22

**Context.** The error handler's server-error line read `err.message`, so a thrown string or number
was logged as `Error Occurred: undefined` (U3).
**Decision.** The line reads `loggableErrorMessage(err)`, which writes `String(value)` for a
non-Error and masks a database error's quoted values, as the logger does for the error itself.
**Options considered.** _Wrap the value in an `Error`:_ its stack would point at the error handler
rather than the throw, and Sentry would be sent a different object from the one thrown.
**Consequences.** A thrown non-Error is named in the line. The 500 response is unchanged.
