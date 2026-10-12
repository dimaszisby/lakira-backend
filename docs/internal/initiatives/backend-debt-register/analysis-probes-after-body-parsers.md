# B-06 — The probes run after the body parsers, ahead of the limiter

Register row [B-06](register.md). Read at `bf72b58`. Found by the security review of #156; read in
the code, never reproduced.

## 1. What is wrong

`GET /api/v1/health` (`src/server.ts:167`) and `GET /api/v1/ready` (`:188`) are mounted after
`express.json()` (`:118-120`), `cookieParser` (`:126`), the request-id and access-log middleware
(`:129`, `:133`), `helmet` (`:136`), `xss-clean` (`:150`), `hpp` (`:151`) and CORS (`:158`), and
before `globalRateLimiter` (`:202`). A request to either probe with a JSON body up to
`REQUEST_BODY_LIMIT` (1 MB by default) is parsed and walked by `xss-clean` before the handler
runs, and nothing throttles it. #156 capped what a probe costs the database; this is what it costs
the CPU.

## 2. Root cause

The probes were placed "before rate limiting" and not "before everything a request body can
exercise". The reviewer noted the same is true of every route, since the limiter is mounted after
the parsers: an attacker pays the same for any path. The probes differ in that nothing behind them
needs a body at all.

## 3. Options

- **A. Mount the probes first**, before `express.json()`. They read no body, cookie or query.
  They would lose the request id and the access-log line (the access log already skips them,
  `src/shared/middleware/access-log.ts:19`), `helmet`'s headers and the HTTPS redirect.
- **B. Mount the probes after `requestIdMiddleware` and `helmet`, before the parsers.** Keeps the
  headers and the id; needs the middleware order changed, since the JSON parser is first today.
- **C. Move the app-wide limiter ahead of the parsers** and keep the probes ahead of the limiter.
  Fixes the general case, the one the reviewer said applies to every route. The limiter then
  counts requests whose bodies are never parsed, which is what a limiter is for.
- **D. Both B and C.**

## 4. Recommendation

**D, as two commits in one PR**, C first. C is the real exposure: today a flood of 1 MB bodies to
any route is parsed before it is counted. B then keeps the probes cheap and unthrottled. The
HTTPS redirect needs a decision for the probes: a platform's probe usually speaks plain HTTP to
the container, and the image smoke already checks the redirect and the probes together, so that
gate will say if the order breaks either.

## 5. Acceptance criteria for the fix

- **AC-1** — A request to `/ready` or `/health` with a 1 MB JSON body is answered without the body
  being parsed: a malformed body gets the probe's normal answer, not a 400. _Why:_ the finding.
- **AC-2** — A 101st request in the window to any other route is answered 429 without its body
  being parsed: a malformed body gets 429, not 400. _Why:_ the general case.
- **AC-3** — The probes are still never answered 429. _Why:_ the reason they sit ahead of the
  limiter.
- **AC-4** — Every response, the probes' included, still carries `x-request-id` and `helmet`'s
  headers. _Why:_ existing behaviour that tests and the frontend rely on.
- **AC-5** — `npm run docker:smoke` passes. _Why:_ it exercises the probes, production mode and
  the redirect together.
- **AC-6** — The order in `.claude/rules/security.md` § Global Middleware Stack matches the code.
  _Why:_ that list is what the next change is checked against.

## 6. Size and shape

≤1h of code, plus the tests. **An ADR, or an amendment to the one that fixed the stack's order:**
the middleware order is a security boundary. Gates: typecheck, lint, format, tests, build, image
smoke. The architecture test may pin part of the order; check before moving anything.

## 7. Depends on, unblocks

Depends on nothing. B-05 (the client IP) touches the same limiter: the limiter moving earlier does
not change what `req.ip` is, since `trust proxy` is set at `:115`, before everything.

## 8. Not verified

- That a large body costs measurable CPU through `xss-clean`. It is a reading of the middleware
  order, not a measurement.
- Whether `express-rate-limit` behaves the same when mounted before `cookieParser` and the
  request-id middleware; its log line uses `req.ip` only (`rate-limiter.ts:67`), so it should.
- Whether any test depends on a 400 for a malformed body being counted or not counted by the
  limiter.
