# Sentry 11 data collection — Plan

- **Status:** In progress
- **Appetite:** 2 days — past that, ship with `traceLifecycle: "static"` and file the span rewrite
- **Date:** 2026-10-20

## Context and goals

Register row B-66: when the backend moves `@sentry/node` from 10 to 11, set `dataCollection`
explicitly and correct the two comments that relied on `sendDefaultPii` being off by default
(`src/server.ts:67`, `src/utils/sentry-scrub.ts:220`). The frontend raised it on 2026-10-14.

Sentry's v10 to v11 migration guide (`MIGRATION.md`, getsentry/sentry-javascript, read 2026-10-20)
changes more than the row says. `dataCollection` defaults every category on, bound database query
data and queue arguments included. Spans are streamed: `beforeSendSpan` gets a `StreamedSpanJSON`
and `beforeSendTransaction` is not called, so the span scrubber would clean nothing. `enableLogs`
is gone. The Express integration captures errors at the throw, before the app's handler.

When this lands the backend is on 11.8.0, every data category is named and off, the scrubber
cleans streamed spans, and a server error is captured once, by the handler.

## Acceptance criteria

- **AC-1** — `package.json` and the lockfile resolve `@sentry/node` and `@sentry/core` to 11.8.0
  only.
  _Why:_ B-66; a mixed tree would run two SDKs.
- **AC-2** — `Sentry.init` receives a `dataCollection` naming every category, each off.
  _Why:_ the frontend's ask: the choice written down, not inherited from a default that changed.
- **AC-3** — Through a real 11 client, an error, a log and a streamed span leave scrubbed; a
  database span carries its operation and no `db.query.text`.
  _Why:_ the span hook's input changed shape; only the real SDK proves the hook still runs.
- **AC-4** — A server error reaches Sentry once, through `errorHandler`.
  _Why:_ 11's Express integration would capture it too, and send a domain error as a 5xx.
- **AC-5** — No comment or rule describes `sendDefaultPii`, `beforeSendTransaction` or
  `enableLogs` as current.
  _Why:_ the row names the two comments; the security rule described the old hooks.
- **AC-6** — Every existing scrubber case passes, moved to the streamed shape where it built a
  span; the change is listed.
  _Why:_ the scrubber's coverage must not shrink in the move.

## Open questions

None open. Q-1 (does 11 capture an Express error itself?) was answered by observation: see D-04.

## Out of scope

Turning tracing or logs on; profiling or any new integration; the other ready rows.

## Decisions expected

Version (D-01); the data categories (D-02); the span lifecycle (D-03); the Express capture (D-04);
`attachStacktrace` (D-05).

## Phases

### Phase 0 — kit and branch

Branch, this plan, the checklist, decisions.

### Phase 1 — upgrade and record what breaks

`npm install @sentry/node@^11.8.0`; typecheck; the Sentry tests as they are.

### Phase 2 — the change

`SENTRY_DATA_COLLECTION`, the init options, the span scrubber on the streamed shape, the tests.

### Phase 3 — docs and records

ADR-0071, the security rule, the register, Notion.

## Risks and trade-offs

The span rewrite could run long; the fallback is the static lifecycle, said so. The Express capture
depends on load order, so it was observed in a plain Node process both ways.

## Rollback

Code: revert the PR; the lockfile returns to 10.x. No migration. Events already sent stay sent.

## Security and data

This is the boundary of what leaves the process for a third party. D-02 is the control; AC-2 and
AC-3 prove it.

## References

- Register row B-66; Notion "FE and BE messages", Part 1
- ADR-0071
