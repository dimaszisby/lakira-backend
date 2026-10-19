# ADR-0071 — Sentry 11 collects nothing on its own

- **Status:** Proposed
- **Date:** 2026-10-20
- **Related:** [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md) (the release
  Sentry carries); [ADR-0059](./adr-0059-an-error-passed-to-the-logger-is-reduced-to-an-allowlist.md)
  (what an error reduces to)
- **Origin:** `D-01` to `D-05` in the sentry-11-data-collection kit —
  [`sentry-11-data-collection`](../../internal/initiatives/sentry-11-data-collection/decisions.md);
  register row B-66, raised by lakira-frontend on the Notion page "FE and BE messages", Part 1

---

## Context

The backend sent errors to Sentry through `@sentry/node` 10 with `sendDefaultPii` left at its
default, off, and a scrubber (`src/utils/sentry-scrub.ts`) on every hook. Version 11 removes
`sendDefaultPii`. Its replacement, `dataCollection`, turns every category on unless told otherwise:
user info, cookies, request and response headers, all four HTTP bodies, query strings, stack-frame
variables, bound database query parameters, payloads and results, and queue task arguments.

Version 11 also streams spans by default. `beforeSendSpan` receives a `StreamedSpanJSON` (a name
and attributes, the op as `sentry.op`) and `beforeSendTransaction` is no longer called, so the
scrubber's span hook, written for 10's shape, would have cleaned nothing once tracing was on. Its
Express integration captures a server error at the throw, before the app's error handler runs,
by status code alone; the handler maps a domain error to a 4xx, which that rule cannot see.

## Decision

1. **Every `dataCollection` category is named, and off.** `SENTRY_DATA_COLLECTION` in
   `src/utils/sentry-scrub.ts`, spread into `Sentry.init`. The only number kept is
   `frameContextLines: 5`, lines of the app's own source. A category the SDK adds later is on
   until it is named there.
2. **Spans are streamed, and the scrubber reads the streamed shape.** `traceLifecycle: "stream"`
   is set, not inherited. A database span keeps its operation as its name and loses
   `db.query.text`; header attributes, now lists of values, are masked by name.
   `scrubSentryTransaction` is removed: no transaction event exists under streaming.
3. **One capture path for a server error.** `expressIntegration({ shouldHandleError: false })`;
   `errorHandler` captures a 5xx, as it did on 10.
4. **`attachStacktrace: false`,** 10's default, so captured messages and issue grouping do not
   change with the upgrade.
5. **The scrubber stays.** It cleans what no SDK setting covers: an error's message, and the tags,
   extra and context the app passes itself.

## Options considered

- **Leave `dataCollection` unset and rely on the scrubber.** The scrubber was written for what 10
  attached; 11 attaches more, under names it has never seen. Rejected: the point of the frontend's
  note was that the choice be written down, not inherited.
- **`traceLifecycle: "static"`,** keeping 10's span shape and the old hook. The migration guide
  says it is planned for removal; it would defer the rewrite, not avoid it.
- **Let the Express integration capture, and remove `errorHandler`'s call.** It captures before
  the handler knows the status, so a `DomainError` would reach Sentry as a 5xx. Observed on
  11.8.0: with `Sentry.init` loaded before Express, an error with no status was sent; with this
  option, nothing was.
- **Stay on 10.** It still receives fixes for now, but every month adds to the eventual jump.

## Consequences

- With tracing on, a span leaves with its route, method, status and host names, never a statement,
  a query string, a header value or a client address. With tracing off (the default), nothing
  changes.
- Sentry shows less than its defaults would: no request bodies, no headers, no local variables. An
  error is debugged from its stack, its request id and the logs.
- Moving `Sentry.init` to an `--import` preload, which would let the SDK instrument Express, needs
  no further change: the capture option already holds.

## Enforcement

- `__tests__/unit/config/sentry-release.test.ts` asserts the exact `dataCollection` object, the
  lifecycle, `attachStacktrace` and the Express option `Sentry.init` receives.
- `__tests__/unit/utils/sentry-hooks.sdk.test.ts` runs the hooks through a real 11 client: an
  error, a log and two streamed spans leave scrubbed. With the span hook replaced by a pass-through,
  both span cases fail.
- `__tests__/unit/utils/sentry-scrub.test.ts` checks every address-like attribute name the
  installed `@sentry/conventions` defines, so an upgrade that adds one fails there.

## Links

- Kit: [`sentry-11-data-collection`](../../internal/initiatives/sentry-11-data-collection/README.md)
- Sentry's migration guide, v10 to v11: `MIGRATION.md` in getsentry/sentry-javascript, read
  2026-10-20
