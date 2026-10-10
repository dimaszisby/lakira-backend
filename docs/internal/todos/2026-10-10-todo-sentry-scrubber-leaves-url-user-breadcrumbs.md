# Todo — the Sentry scrubber leaves the URL, the user, breadcrumbs and exception values

- **Status:** Open (P2). Reproduced on 2026-10-10, on the scrubber function
- **Created:** 2026-10-10
- **Owner:** unassigned
- **Origin:** finding V3 of
  [`audit-2026-10-10.md`](../audits/saas-readiness/audit-2026-10-10.md). It is finding T7 of
  `audit-2026-10-05.md`, which had no todo; this run's security grader counted it against caveat
  C5 and reopened the caveat
  ([`saas-reaudit-2026-10-10` D-03](../initiatives/saas-reaudit-2026-10-10/decisions.md))

## The defect

`scrubSentryEvent` in `src/utils/sentry-scrub.ts` masks credential headers, drops cookies, and
applies the sensitive-key pattern to `request.data`, `extra` and `contexts`. It does not touch:

- `request.url` and `request.query_string`, which hold a list search such as `?q=<address>`
- `user`
- breadcrumbs
- exception values, where a Postgres message can quote a value

Read in the code by the grader and not run: transactions do not pass through `beforeSend` at all,
so with `SENTRY_TRACES_SAMPLE_RATE` above 0 they leave unscrubbed.

## Reproduction

The built scrubber, given an event with `alice@example.com` in each of those five places, returned
all five unchanged; `authorization`, `cookie` and `data.password` came back masked. It was not
checked on an event received by Sentry, and whether the SDK fills `user` or the query string for
this app is not established.

## The fix

Strip the query string from `request.url` and drop `query_string`; drop `user` or keep its id
alone; pass breadcrumb messages and exception values through the same reduction; add
`beforeSendTransaction` or keep tracing off. A test builds the event above and asserts the address
is gone.
