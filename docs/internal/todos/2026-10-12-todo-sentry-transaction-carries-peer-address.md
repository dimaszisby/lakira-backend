# Todo — a Sentry transaction carries the request's peer address

- **Status:** Fixed in #160 (`ebfce52`) ([`log-redaction-coverage` D-13](../initiatives/log-redaction-coverage/decisions.md)); not yet re-audited, so C5 stays open until a dated run
- **Created:** 2026-10-12
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-12.md` § 6, W1; graded under V3 by
  the security agent ([`saas-reaudit-2026-10-12` D-03](../initiatives/saas-reaudit-2026-10-12/decisions.md))

---

## What

With `SENTRY_TRACES_SAMPLE_RATE` above 0, the SDK's HTTP server instrumentation sets
`net.peer.ip` and `net.host.ip` on the root span. `DROPPED_KEY` in
`src/utils/sentry-scrub.ts:90-91` names `http.client_ip` and `client.address` only, so both
survive in the transaction's `contexts.trace.data`.

Reproduced on the built server, with a local listener in place of Sentry and three requests: the
captured transaction held `"net.peer.ip":"::ffff:127.0.0.1"`. Behind a proxy the value is the
proxy's address; reached directly it is the client's. The same capture held no query string, no
bearer token, no forwarded address and no user.

## Suggested fix

Add the socket-address attributes to the drop list (`net.peer.ip`, `net.host.ip`,
`net.sock.peer.addr`, `net.sock.host.addr`, `network.peer.address`, `server.address` where it is
an address), or drop by pattern. Test it the way the run did: send a real transaction through the
SDK to a local listener and read what leaves, so a new attribute in a later SDK version fails the
test.

## Then

A dated run. Under ADR-012 it can restate GOLD if this closes.
