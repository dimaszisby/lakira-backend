# Todo — what the review of the Sentry scrubber left open

- **Status:** Open (all P3)
- **Created:** 2026-10-10
- **Owner:** unassigned
- **Origin:** the security review of `fix/c5-sentry-scrubber`
  ([`log-redaction-coverage` D-12](../initiatives/log-redaction-coverage/decisions.md)). None is
  the route caveat C5 closes on (ADR-012 of the audit folder), so each is a finding in its own
  right

Read in the code and the SDK source by the reviewer; not reproduced unless it says so.

## Items

- **Transaction name and `logentry` on an error event.** `event.transaction` and `logentry` are
  not cleaned. The name is the matched route, so it is a pattern such as `GET /api/v1/metrics/:id`
  and holds no value; an unmatched raw path would reach it. No route in `src/` takes a name or an
  address as a path parameter.
- **Free text the patterns do not know.** A name (`Key (name)=(Alice Smith)`), a value Postgres
  quotes in `invalid input syntax`, and an API key with no `Bearer` in front of it all pass. D-12
  states the limit; the remedy is not to put such values in error messages, or a server-side
  scrubbing rule in the Sentry project.
- **`user-agent` and other non-credential headers** still leave with an event, cleaned as text.
- **The wiring has no test.** The three hooks are checked by a throwaway script against the real
  SDK with a stub transport, not by a test in the suite. Worth keeping as a test if the SDK is
  upgraded.
- **Cosmetic.** A URL in angle brackets or followed by a comma can lose that character with its
  query string; `git@github.com:org/repo` becomes `[email]:org/repo`.
