# Todo — the probes run after the body parsers, ahead of the limiter

- **Status:** Fixed in #161 (`dd65318`, ADR-0061). The P3 in this file, `Cache-Control: no-store` on the probes, is still open (register row B-63)
- **Created:** 2026-10-11
- **Owner:** unassigned
- **Origin:** the security review of `fix/readiness-probe-cached`
  ([`production-readiness` D-03](../initiatives/production-readiness/decisions.md)). It graded S9
  closed and listed this as new and outside S9

Read in the code by the reviewer; not reproduced.

## What

`GET /api/v1/health` and `GET /api/v1/ready` are mounted after `express.json()`, `cookie-parser`,
`xss-clean`, `hpp` and CORS, and before `globalRateLimiter` (`src/server.ts`). A request to either
with a large JSON body is parsed and walked before the handler runs, and nothing throttles it. A
malformed body reaches the error handler and its log line.

## Context the grade does not carry

This is not particular to the probes. The limiter is mounted after the parsers, so every route
pays the parse before it is counted, and `REQUEST_BODY_LIMIT` bounds each body. What is particular
to the probes is that they are never counted at all.

## Suggested fix

Mount the two probe routes before the body parsers and `xss-clean`, keeping `helmet`, the request
id and the TRACE guard ahead of them. That changes the documented middleware order
(`.claude/rules/security.md` § Global Middleware Stack), so check the access-log and HTTPS-redirect
behaviour for the probes and the image smoke with it.

Also from the same review, P3: `/ready` sends no `Cache-Control: no-store`, so a cache in front of
it could hold a stale 200.
