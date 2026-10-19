# Decisions — sentry-11-data-collection

## D-01 — `@sentry/node` 11.8.0

- **Status:** Proposed
- **Date:** 2026-10-20

**Context.** The backend was on `^10.51.0` (10.69.0 installed). 11.0.0 shipped 2026-09-23 and
11.8.0, the newest, 2026-10-15; every 11.x is under a month old.
**Decision.** `^11.8.0`. It resolves one `@sentry/node` and one `@sentry/core`, both 11.8.0, adds no
package with an install script, and the security delta gate passes with no new finding (its three
medium findings are the existing `sequelize`/`uuid` advisory and a CORS scan).
**Options considered.** An earlier 11.x: no reason to take fewer fixes in a fresh major. Staying on
10: the jump only grows.
**Consequences.** `@sentry/node-core` is merged into `@sentry/node`; nothing here imported it.

## D-02 — Every `dataCollection` category named, and off

Promoted to the architecture decision registry as
**[ADR-0071](../../../explanation/decisions/adr-0071-sentry-11-collects-nothing-on-its-own.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — Spans stay streamed, and the scrubber reads the streamed shape

Promoted to the architecture decision registry as
**[ADR-0071](../../../explanation/decisions/adr-0071-sentry-11-collects-nothing-on-its-own.md)**.
That file is authoritative; this entry is a pointer.

## D-04 — One capture path for a server error: `errorHandler`'s

Promoted to the architecture decision registry as
**[ADR-0071](../../../explanation/decisions/adr-0071-sentry-11-collects-nothing-on-its-own.md)**.
That file is authoritative; this entry is a pointer.

## D-05 — `attachStacktrace: false`, as on 10

Promoted to the architecture decision registry as
**[ADR-0071](../../../explanation/decisions/adr-0071-sentry-11-collects-nothing-on-its-own.md)**.
That file is authoritative; this entry is a pointer.
