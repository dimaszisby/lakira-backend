# B-14 — Any `x-request-id` a client sends is accepted unchecked

Register row [B-14](register.md). Read at `bf72b58`. Carried by the audits since 2026-06-05
without a grade; written up by the frontend on 2026-10-04 in its own todos and never raised on the
Notion page.

## 1. What is wrong

`requestIdMiddleware` takes an incoming `x-request-id` as the request's id whenever it is a
non-empty string (`src/shared/middleware/request-id.ts:15-19`), with no check of length or
characters. That id is written on every log line of the request, echoed in the response header
(`:21`), and tagged on the Sentry event. The frontend's proxy forwards browser headers unchanged,
so a browser chooses it.

What a caller can do: put arbitrary text of any length into every log line of its own request,
and reuse another request's id so the id stops identifying one request. What it cannot do: read
anything, or reach another user's data. Logs go to stdout as JSON, so a newline inside the value
is escaped and cannot forge a second line.

## 2. Root cause

The middleware was written for a trusted caller, a gateway that mints ids. The backend's only
callers are browsers through the frontend's proxy and direct API clients, neither trusted.

## 3. Options

- **A. Validate and fall back:** accept the incoming value only if it matches a strict shape (a
  UUID, or up to 64 characters of `[A-Za-z0-9._-]`), otherwise mint one. Keeps end-to-end
  correlation with a well-behaved caller.
- **B. Always mint**, and record a valid incoming value as a separate field
  (`clientRequestId`). The backend's id is then always its own, and correlation survives.
- **C. The frontend's proxy drops the header** before forwarding. Fixes browser traffic only;
  direct callers are unchanged.
- **D. Trust the header only from a trusted hop**, tied to `TRUST_PROXY`. Correct in principle and
  depends on B-05 being right first.

## 4. Recommendation

**A in the backend.** It is one regular expression and removes the unbounded-length case, which
is the only part with a cost (log volume). B is cleaner and changes the meaning of a field the
frontend already tags its own Sentry events with, so it would need the frontend to change in
step. C can follow in the frontend if it wants a single source of ids.

## 5. Acceptance criteria for the fix

- **AC-1** — A request with a well-formed `x-request-id` gets it back and has it on its log lines.
  _Why:_ existing behaviour, and the frontend reads it (`normalizeApiError.ts` in the frontend).
- **AC-2** — A request whose `x-request-id` is longer than the limit, or holds a character outside
  the set, gets a freshly minted id; the sent value appears in no log line. _Why:_ the finding.
- **AC-3** — A request that sends the header twice is handled without error. _Why:_ Node gives a
  string for a repeated `x-request-id` joined by commas; the pattern must reject or accept it on
  purpose.
- **AC-4** — The accepted shape is documented beside the header in `docs/reference/api/README.md`.
  _Why:_ a caller needs to know what will be honoured.

## 6. Size and shape

≤1h. Micro entry in the `observability` kit. No ADR, though ADR-0027 (the request id) gains a
sentence. Gates: typecheck, lint, format, tests, build. No spec change: the header is not in the
spec today.

## 7. Depends on, unblocks

Depends on nothing. The frontend caps the value at 128 characters on its side; a backend limit of
64 with a UUID in practice does not conflict. Worth a line on the Notion page when it ships, so
the frontend can close its todo.

## 8. Not verified

- What ids the frontend's proxy actually sends: whether it mints one or passes the browser's.
- The behaviour for a repeated header (AC-3) was reasoned from Node's header handling, not run.
- Whether any deployed gateway in front of the backend sets the header in a longer format.
