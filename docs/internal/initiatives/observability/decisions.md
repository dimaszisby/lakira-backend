# Observability Kit — Decisions Log

ADR-style entries scoped to the observability kit. Cross-kit decisions live in `docs/internal/audits/saas-readiness/decisions.md`.

---

## ADR-001 — AsyncLocalStorage for request correlation, not cls-rtracer

Promoted to the architecture decision registry as **[ADR-0027](../../../explanation/decisions/adr-0027-asynclocalstorage-for-request-correlation.md)**. That file is authoritative; this entry is a pointer.

## ADR-002 — Sentry init lifecycle: top of server.ts, env-gated

Promoted to the architecture decision registry as **[ADR-0021](../../../explanation/decisions/adr-0021-sentry-init-lifecycle.md)**. That file is authoritative; this entry is a pointer.

## ADR-003 — Move SENSITIVE_KEY_PATTERN out of envManager.ts

Promoted to the architecture decision registry as **[ADR-0028](../../../explanation/decisions/adr-0028-sensitive-key-pattern-out-of-envmanager.md)**. That file is authoritative; this entry is a pointer.

## ADR-004 — Centralize analytics env reads through `envManager`

Promoted to the architecture decision registry as **[ADR-0033](../../../explanation/decisions/adr-0033-centralize-analytics-env-reads.md)**. That file is authoritative; this entry is a pointer.

## D-05 — An incoming `x-request-id` is used only when it has a safe shape

- **Status:** Accepted
- **Date:** 2026-10-14

Micro entry for register row B-14 (carried by the audits since 2026-06-05, ungraded; the
frontend's F-14), on `fix/request-id-shape`. Numbered `D-05` after the four `ADR-00N` entries
above, which keep their numbers. Written before any code.

**Context.** `requestIdMiddleware` took any non-empty incoming `x-request-id` as the request's id,
with no check of length or characters. The id goes onto every log line of the request, back in
the response header, and onto the Sentry event's tags. A caller could put text of any length on
every log line of its own request, and reuse another request's id so the id no longer names one
request. Since lakira-frontend #92 the frontend's proxy drops the header, so browser traffic
already gets a minted id; a caller that reaches the backend directly still chooses it.
**Decision.** An incoming `x-request-id` is used only when it is 1 to 64 characters of
`[A-Za-z0-9._-]`. Anything else, like an absent header, gets a minted UUID. A UUID fits the set.
A header sent twice reaches Node joined as `"a, b"` and is replaced, on purpose. The value
rejected is neither logged nor echoed, and no line records the rejection.
**Options considered.** Always minting and keeping the caller's id as a separate field: cleaner,
but it changes the id the frontend reads back and tags its Sentry events with, so it would need
the frontend to move in step. Trusting the header only from a trusted hop: correct in principle,
and it depends on B-05, which waits on the frontend. Leaving it to the frontend's proxy: done in
#92, and it covers browser traffic only. Logging the rejection: a well-formed caller loses
nothing, and a line naming only the field and the rule would tell no reader anything useful.
**Consequences.** A direct caller that sends a longer or unusual id gets a backend-minted one
back. A gateway that sets ids in a longer format would lose correlation with the backend; none is
known. ADR-0027 gains a note.
**What the runs showed.** Eleven new cases, eight unit and three integration, fail on the code at
`6f686e6`. A header sent twice came back as `first-id, second-id`, as Node's joining had
suggested. On the built server, a 65-character id came back as a minted UUID; that UUID was on
both of the request's log lines and the value sent was on none. The health and readiness probes
write no access line, so the check used `GET /auth/profile`.
**From the review,** my own. The pattern is exported as `REQUEST_ID_PATTERN` so the tests and any
later caller read one definition. An id sent in another case of the header name is the same
header to Node and is judged the same way. Not graded by anyone else.
