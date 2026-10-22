# Decisions — v6-small-items

## D-01 — The error handler decides the status first, then logs by it

- **Status:** Accepted (#208, `90d6f6d`)
- **Date:** 2026-10-22

**Context.** `createErrorHandler` chose its log line before it knew the status. Only a framework
client error, recognised by a numeric `status`, was logged as a client error. An `AppError` carries
`status: "fail"`, and a `DomainError` none, so a 401 from `authMiddleware` or a 404 `NotFoundError`
was written at error level with its stack (V6, reproduced on 2026-10-20).
**Decision.** The handler resolves the `AppError` it will answer with first. Every 4xx, whatever
raised it, writes one warn line, `Client error <status>: <label>`, with no stack and no message,
which is what the framework path already wrote. The label is the raiser's `type` token or the
error's name; `AppError` now sets its `name` as `DomainError` does, so it reads `AppError`, not
`Error`. A 5xx and a `DatabaseError` stay at error with the error.
**Options considered.** _Keep the message on a 4xx line:_ it is written by the server but can quote
what was sent (a range, a name), and `security.md` asks a rejected request's line for the field and
the rule, not the value. _Give `AppError` a numeric `status`:_ `status` is the envelope's
`"fail" | "error"`, read by the response; renaming it touches every caller for no gain.
**Consequences.** A client mistake no longer reads as a server fault in the log or in a level-based
alert. Telling two 401s apart from the log alone now takes the request id and the access line.

---

## D-02 — A rejected promise is logged like a thrown error

- **Status:** Accepted (#208, `90d6f6d`)
- **Date:** 2026-10-22

**Context.** `server.ts` logged an unhandled rejection with `promise, "reason:", reason` as extra
arguments, which `splat()` drops when the message has no token, so the line said nothing about what
was rejected (V6, reproduced on 2026-10-20). `worker.ts` passed the reason alone: an `Error` came
through, anything else was dropped.
**Decision.** One `logUnhandledRejection(prefix, reason)` in `src/utils/logger.ts`, called by both.
An `Error` goes as the error argument, the path `uncaughtException` already takes. Anything else
goes into the message through `loggableErrorMessage`.
**Options considered.** _Fix each call site inline:_ two copies of the same rule, one of which was
already the wrong one. _Pass `{ reason }` as metadata:_ a non-Error object would be written whole,
past the error allowlist.
**Consequences.** A process that exits on a rejection says why.

---

## D-03 — `If-None-Match` is judged by Express's `req.fresh`

- **Status:** Accepted (#208, `90d6f6d`)
- **Date:** 2026-10-22

**Context.** Both analytics handlers compared `If-None-Match` to their ETag as one exact string, so
a list (`"a", "b"`), a weak validator (`W/"a"`) or `*` never got a 304 (V6). RFC 9110 § 13.1.2 says
`If-None-Match` uses the weak comparison over a comma-separated list, and `*` matches any current
representation.
**Decision.** Each handler sets its `ETag` and then answers 304 when `req.fresh` is true. Express
reads the response's `ETag` and hands both to `fresh` 0.5.2, which splits the list, compares
weakly and treats `*` as a match. It also answers "not fresh" when the request says
`Cache-Control: no-cache`, the client's way of asking for an end-to-end reload.
**Options considered.** _A parser of our own beside `makeEtag`:_ first planned, and dropped once
`fresh` turned out to do all three already, as a dependency Express itself ships. _A shared
middleware:_ two call sites in one file.
**Consequences.** The handlers send no `Last-Modified`, so `If-Modified-Since` alone never makes a
request fresh.
**Amended during implementation (2026-10-22).** The four new tests in `analytics-caching.test.ts`
(a list, `W/`, `*`, and a list without the ETag) passed with the exact-string comparison still in
place. Express 4.22.3's `res.send` sets 304 itself when `req.fresh` is true
(`node_modules/express/lib/response.js:210`), and `successResponse` sends through `res.json`. So a
list, a weak validator or `*` already got its 304; the handler's own check was an early exit that
missed them, and Express answered 304 after serialising a body it then dropped. V6 item 4 was not
observable. The change stays: one test, stated where the 304 is decided, that also skips that
serialisation. The tests stay as guards of the behaviour, not as proof of a fix.

---

## D-04 — The analytics limits are handed in by `feature.ts`

- **Status:** Accepted (#208, `90d6f6d`)
- **Date:** 2026-10-22

**Context.** `GetVisualization` read `env.VIZ_MAX_BUCKETS` at import time; `GetDashboardVisualization`
called `loadEnvOrExit()` on every request (V6). `envManager` is on the application allowlist, so
neither broke a rule, but one setting was read two ways in one layer.
**Decision.** Both queries take their limits in the constructor. `buildAnalyticsFeature` reads
`VIZ_MAX_BUCKETS` and `VIZ_DASH_MAX_METRICS` from `env` once and hands them in.
**Options considered.** _Make both read `env` the same way:_ it keeps config entering below the
composition root, and the tests keep needing an env override to change a limit.
**Consequences.** No file under `analytics/application/` imports `envManager`, and with it none in
any feature. A test sets a limit by constructing the query with it.
**Found during implementation (2026-10-22): ADR-0033.** That ADR put `loadEnvOrExit()` inside
`GetDashboardVisualization.execute()` on purpose, so a `withTestEnv` test could change
`VIZ_DASH_MAX_METRICS`, and its open follow-up pointed the other way: move the `env`-singleton
reads, `GetVisualization.ts` among them, to `loadEnvOrExit()`. Its decision, every analytics
setting validated by Zod and read through `envManager`, is untouched; this changes where two call
sites read it. The test reason goes away once the limit is a constructor argument, and auth's
`feature.ts` already hands `ttlSec` and its frontend URLs to its use cases the same way. ADR-0033
gains an "Amended" line pointing here, as its 2026-10-09 amendment did.

---

## D-05 — The domain names its own bucket figures

- **Status:** Accepted (#208, `90d6f6d`)
- **Date:** 2026-10-22

**Context.** `BucketAggregate` in `analytics/domain/series-stats.ts` was the SQL row,
`{ avg_value, min_value, max_value, cnt }`, so the domain's input type was spelled by the query
(V6).
**Decision.** It becomes `{ average, min, max, count }`, still tolerant of the numeric strings
Postgres returns. `VisualizationReadRepoSequelize` maps each row to it before `summarizeBuckets`.
**Options considered.** _Convert to numbers in the repository too:_ `finite()` already does that
in one place, and moving it splits the rule for an empty bucket across two files.
**Consequences.** Renaming a SQL column touches the repository's mapping only.
