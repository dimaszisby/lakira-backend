# ADR-0091 — Span attributes pass an allowlist, and every scrub hook is guarded

- **Status:** Accepted
- **Date:** 2026-11-08
- **Related:** issue #256 (kit `log-redaction-coverage` D-13 "From the review"; audit of 2026-10-20
  § 6, X4 and X13; register row B-62); [ADR-0071](./adr-0071-sentry-11-collects-nothing-on-its-own.md), which
  turns off everything the SDK collects on its own
- **Origin:** issue #256; the owner chose the allowlist on 2026-11-08

---

## Context

Three gaps were left in what Sentry receives, all in `src/utils/sentry-scrub.ts`:

- **Span attributes were filtered by a denylist:** named keys and any value that is an address were
  dropped, and the rest passed, cleaned as text. An attribute an SDK upgrade added passed until
  someone named it, and Sentry 11 had already renamed attributes between releases.
- **A hook that throws.** Read from `@sentry/core` 11.8: an error event or a log whose hook throws
  is dropped, but a span whose `beforeSendSpan` throws is sent unmodified, and a span hook that
  returns nothing sends the original too.
- **`event.server_name`** is the host name (`os.hostname()`), which can be an address, and nothing
  scrubbed it.

## Decision

- **Span attributes pass an allowlist**, `SPAN_ATTRIBUTE_ALLOWED`, in spans and in the root span's
  attributes on an error event (`contexts.trace.data`). It holds:
  - Sentry's own `sentry.*`, which its UI reads;
  - the HTTP method, status code, route and response length, and the older `http.url` and
    `http.target`;
  - `url.path`, `url.full` and `url.scheme`;
  - Express's name and type;
  - a database span's system, operation and database name;
  - `server.address` and `server.port`, and `net.host` and `net.peer` names and ports, kept as
    `log-redaction-coverage` D-13 decided;
  - `user.id`.

  A kept value is still cleaned as before. Breadcrumb data and log attributes keep the denylist:
  the app sends no logs, and breadcrumbs carry free-form data.

- **Every hook is guarded** by `guardScrubHooks`, which builds `SENTRY_SCRUB_HOOKS`. An event or a
  log whose scrubber throws is dropped, whatever the SDK would do. A span cannot be dropped, so it
  goes out as its ids and times alone, named `[scrub failed]`, with no attributes and no links.
  Each failure logs one warning naming the hook and the error's name, never its message.
- **`server_name` loses an address**, as free text does (`[address]`); a host name stays.

## Options considered

- **Keep the denylist and record the gap as accepted:** the vendors' default, and it never hides
  anything Sentry's views use. But every SDK upgrade could send something new unnoticed, the one
  place ADR-0071's "name every category, inherit nothing" stance did not reach.
- **Drop a span whose hook throws:** the SDK offers no way to; returning nothing sends the
  original.
- **Drop `server_name` entirely:** it tells instances apart, and a host name is not personal.

## Consequences

- An SDK upgrade can only make Sentry show less. A view that needs an unlisted attribute shows less
  until the attribute is added to `SPAN_ATTRIBUTE_ALLOWED`, with a test.
- Attributes kept before only by being unknown, such as `app.version` or `db.connection_string`,
  now go.
- `__tests__/unit/utils/sentry-hooks.sdk.test.ts` pins the SDK's raw-span behaviour, so a change
  in it shows up there.
