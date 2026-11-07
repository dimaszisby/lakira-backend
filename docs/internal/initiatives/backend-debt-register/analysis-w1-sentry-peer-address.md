# B-01 — A Sentry transaction carries the request's peer address

Register row [B-01](register.md). Read at `bf72b58`. `@sentry/node` 10.69.0.

## 1. What is wrong

With `SENTRY_TRACES_SAMPLE_RATE` above 0, every sampled request sends a transaction whose
`contexts.trace.data` holds `net.peer.ip` and `net.host.ip`. Reproduced in the audit of 2026-10-12:
the built server, a local listener in place of Sentry, three requests; the captured transaction
held `"net.peer.ip":"::ffff:127.0.0.1"`. Reached directly the value is the client's address; behind
a proxy it is the proxy's.

It keeps caveat C5 open, counted under V3 by the grader
([`saas-reaudit-2026-10-12` D-03](../saas-reaudit-2026-10-12/decisions.md)).

## 2. Root cause

The scrubber drops attributes by an exact-name list, `DROPPED_KEY` at
`src/utils/sentry-scrub.ts:90-91`, which names `http.client_ip` and `client.address`. The SDK's
HTTP server instrumentation sets more than those two
(`node_modules/@sentry/core/build/cjs/integrations/http/server-subscription.js:191-194`):
`net.host.ip`, `net.host.port`, `net.peer.ip`, `net.peer.port`. Its outgoing-request code sets
`network.peer.address` and `net.peer.ip` as well (`get-outgoing-span-data.js:55-57`). A list of
names written from the documentation missed the names the code uses.

## 3. Options

- **A. Add the missing names to `DROPPED_KEY`.** One line. Breaks again when an SDK release adds
  another spelling.
- **B. Drop by pattern:** any attribute whose key ends in `.ip`, `.address` or `.addr`, or is
  `http.client_ip`. Catches the next spelling. Risk: it also drops `server.address` and
  `net.peer.name`-like keys only if the pattern is written loosely, so it needs a test of what is
  kept.
- **C. Allowlist span attributes.** Keep only the keys this app reads in Sentry (route, method,
  status, duration, the database operation). Strongest; it also removes attributes someone may
  want later, and every new instrumentation needs a list change.

## 4. Recommendation

**B, with the test from §5.** A is what failed. C is the right end state for a scrubber and too
large for the change that unblocks the audit; file it as a follow-up if B's test shows more
address-like keys than expected.

## 5. Acceptance criteria for the fix

- **AC-1** — A transaction sent through the real SDK to a local listener, for a request with a
  forwarded address, contains no IPv4 or IPv6 address in any attribute of the root span or its
  children. _Why:_ the audit's reproduction, kept as a test so a new SDK attribute fails it.
- **AC-2** — The same transaction still carries the route, the method and the status code.
  _Why:_ a pattern that drops too much makes tracing useless.
- **AC-3** — The outgoing-request span (a call to Resend or Mailpit) carries no peer address.
  _Why:_ `get-outgoing-span-data.js:55-57` sets one.
- **AC-4** — The unit tests of `scrubSentrySpan` and `scrubSentryTransaction` name each dropped key
  the SDK sets at 10.69.0. _Why:_ the list should be read from the code, once, and pinned.

## 6. Size and shape

≤1h of code; the listener test is most of it. Micro entry in
`log-redaction-coverage/decisions.md`. No ADR: no interface, data shape or dependency changes.
Gates: typecheck, lint, format, tests, build. `.claude/rules/security.md` gains the peer address in
its Sentry paragraph.

## 7. Depends on, unblocks

Depends on nothing. Unblocks the next dated audit run, which can restate GOLD if the grader closes
V3. A fix does not close C5 by itself (ADR-002).

## 8. Not verified

- Only one transaction was captured; an error event was not, because provoking a 5xx needs a
  write. `scrubSentryEvent` was read, not exercised end to end.
- Whether `net.host.ip` is sensitive is a judgment: it is the server's own address. The grader
  named both, so both are dropped.
- The SDK's attribute names were read at 10.69.0 only.
