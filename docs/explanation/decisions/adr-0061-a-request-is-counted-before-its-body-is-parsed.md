# ADR-0061 — A request is counted before its body is parsed

- **Status:** Accepted (2026-10-13)
- **Date:** 2026-10-13
- **Related:** [ADR-0057](./adr-0057-rate-limiters-answer-through-the-error-envelope.md) (what a
  limiter answers); [ADR-0027](./adr-0027-asynclocalstorage-for-request-correlation.md) (the request id);
  [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md) (the access log); `.claude/rules/security.md`
  § Global Middleware Stack
- **Origin:** `D-04` in the production-readiness kit —
  [`production-readiness`](../../internal/initiatives/production-readiness/decisions.md);
  register row B-06
  ([analysis](../../internal/initiatives/backend-debt-register/analysis-probes-after-body-parsers.md))

---

## Context

The app-wide rate limiter was the last of twelve global middleware. `express.json()`,
`cookie-parser`, `xss-clean` and `hpp` all ran before it, so a request body of up to
`REQUEST_BODY_LIMIT` (1 MB by default) was read, parsed and walked before the request was counted,
on every route. A caller past the limit still cost a full parse per request.

The two probes, `/api/v1/health` and `/api/v1/ready`, sat ahead of the limiter on purpose, so a
platform probe is never throttled, and behind the parsers by accident. A probe sent with a body
parsed it, and nothing throttled that. The security review of #156 found the probe half and noted
the general one.

Reading the order showed a second defect. `express.json()` was the first middleware of all, ahead
of the request id, the access log and `helmet`. A malformed or oversized body was therefore
answered with no `x-request-id`, no access-log line and no security headers.

No record fixed the order. It was a list in `.claude/rules/security.md` and twelve `app.use` calls
in `src/server.ts`.

## Decision

1. **Nothing reads a request body until the app-wide limiter has counted the request.** The order
   of the global middleware is:

   | #   | Middleware           | Why here                                                            |
   | --- | -------------------- | ------------------------------------------------------------------- |
   | 1   | request id           | every later log line and response carries it                        |
   | 2   | access log           | a request rejected by anything below is still logged                |
   | 3   | `helmet`             | every response, errors included, carries the security headers       |
   | 4   | HTTPS redirect       | production only; a redirected request is neither counted nor parsed |
   | 5   | TRACE guard          | a 405 costs nothing and is not counted                              |
   | 6   | CORS                 | a 429 without these headers reaches a browser as a CORS error       |
   | 7   | the probes           | never throttled, and they read no body                              |
   | 8   | the app-wide limiter | counts before anything below runs                                   |
   | 9   | `express.json`       | the first thing to read the body                                    |
   | 10  | `cookie-parser`      |                                                                     |
   | 11  | `xss-clean`          | after the parsers it sanitises                                      |
   | 12  | `hpp`                |                                                                     |

2. **The order lives in one function**, `mountHttpPipeline` in
   `src/shared/middleware/http-pipeline.ts`. `src/server.ts` calls it once, before it registers
   anything else on the app, and passes it the limiter and a callback that mounts the probes.
3. **A body or cookie parser, `helmet`, `hpp`, `xss-clean` and `cors` are imported in that file
   only.** A parser mounted in a feature router would read a body outside the order.
4. **The per-route limiters stay where they are**, inside routers and after the parsers. They key
   on a parsed body or an authenticated user.

## Options considered

- **Move the probes ahead of the parsers and nothing else.** Rejected: every other route would
  still parse before it counts, which is the larger exposure.
- **Move the limiter and leave the probes behind the parsers.** Rejected: a probe would still
  parse a body it never reads.
- **A smaller body limit for the probes.** Rejected: the cost is parsing at all, and a probe has
  no use for a body.
- **Keep the list inline in `server.ts`.** Rejected: the integration suite runs with rate limiting
  off, so the order could be asserted only by reading the file's text. A function can be called
  with a limiter of two.

## Consequences

- A request with a malformed or oversized body now counts against the app-wide limit. Before, it
  failed ahead of the limiter and was never counted.
- A 400 for a malformed body, a 413 and a 415 gain `x-request-id`, the security headers and an
  access-log line, and their log lines carry the request id.
- A probe called with a body ignores it.
- Preflight requests, TRACE requests and production redirects are answered ahead of the limiter
  and are not counted, as before.
- What the limiter keys on is unchanged: `req.ip`, with `trust proxy` set before the pipeline.
  That is register row B-05.
- A new global middleware is added in `mountHttpPipeline`, at a place chosen against the table
  above. One that reads the body goes below the limiter.

## Enforcement

- `__tests__/unit/shared/middleware/http-pipeline.test.ts` builds a bare app with the real
  function and a limiter of two, and asserts the order by behaviour: a probe ignores a malformed
  body; past the limit a malformed body gets 429, not 400; a probe is never throttled or counted;
  a 400, a 413 and a 429 carry the request id and the security headers.
- `__tests__/unit/architecture.test.ts` › "the global middleware is mounted in one place": the
  server passes the real limiter and registers nothing on the app before the pipeline, and no
  other file under `src/` imports a parser or the security middleware.
- `__tests__/integration/health/` proves on the real app that both probes ignore a body.
- `npm run docker:smoke` exercises the probes and the redirect in production mode.

Not enforced by a test: that the real app, with rate limiting on, counts before it parses. The
integration suite disables rate limiting. It was checked by hand on the built server when this
was written: with a limit of five, seven requests with a malformed body answered 400 five times
and then 429.
