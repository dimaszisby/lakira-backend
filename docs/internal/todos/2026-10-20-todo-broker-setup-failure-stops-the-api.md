# Todo — a broker declaration mismatch stops the API

- **Status:** Closed by #203 (`2c1c098`), branch `fix/queue-failure-paths`
  ([`queue-failure-paths`](../initiatives/queue-failure-paths/README.md), ADR-0080).
  Reproduced by tests first; a dated run is owed to confirm it
- **Created:** 2026-10-20
- **Owner:** unassigned
- **Origin:** dated SaaS-readiness run of 2026-10-20, finding X63
  ([`audit-2026-10-20.md`](../audits/saas-readiness/audit-2026-10-20.md) § 6)

---

## What

No `ChannelWrapper` has an `error` listener (`RabbitMQPublisher.ts:24`, `RabbitMQConsumer.ts:50`).
When a channel's `setup` fails, for example `assertTopology` meeting a queue declared with other
arguments, the library emits `error` with no listener, the throw lands in a promise, and the server's
unhandled-rejection handler shuts it down. A problem on an optional dependency takes the HTTP server
down, although the in-process fallbacks exist for exactly that case.

Reproduced on the dated run of 2026-10-20: a work queue redeclared on the broker with another
dead-letter exchange, and the API exited 1 through "Unhandled Rejection".

## Suggested fix

An `error` listener on every channel wrapper that logs and leaves the publisher reporting itself
unavailable, so callers take their fallback. A test that fails `setup`.
