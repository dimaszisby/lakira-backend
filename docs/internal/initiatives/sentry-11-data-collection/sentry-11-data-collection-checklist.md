# Sentry 11 data collection — Checklist

## Phase 0 — kit and branch

- [x] `fix/sentry-11-data-collection` cut with `--no-track` from `origin/dev` at `15555ca`; HEAD
      and upstream verified
- [x] `README.md`, the plan, this file, `decisions.md`

## Phase 1 — upgrade and record what breaks

- [x] `package.json` `^11.8.0`; `npm ls`: one `@sentry/node` and one `@sentry/core`, 11.8.0; no
      new package with an install script
- [x] Typecheck: `enableLogs` no longer exists (`sentry-hooks.sdk.test.ts`); `beforeSendSpan`
      takes a `StreamedSpanJSON`, which shares no property with `ScrubbableSpan` (`server.ts`)
- [x] The Sentry tests unchanged: 2 of 101 failed — the init test (the type error above) and the
      address-name guard, which found `address`, 11's deprecated alias of `server.address`

## Phase 2 — the change

- [x] `src/utils/sentry-scrub.ts` — `SENTRY_DATA_COLLECTION`; `ScrubbableSpan` as `name` and
      `attributes`, the op from `sentry.op`; `scrubSentryTransaction` and `ScrubbableTransaction`
      removed; `beforeSendTransaction` out of `SENTRY_SCRUB_HOOKS`; comments for 11
- [x] `src/server.ts` — `dataCollection`, `traceLifecycle: "stream"`, `attachStacktrace: false`,
      `expressIntegration({ shouldHandleError: false })`; the comment for 11
- [x] `__tests__/unit/config/sentry-release.test.ts` — the exact options `Sentry.init` receives
- [x] `__tests__/unit/utils/sentry-hooks.sdk.test.ts` — `enableLogs` out; a streamed HTTP span
      and a database span through a real client
- [x] `__tests__/unit/utils/sentry-scrub.test.ts` — span cases on the streamed shape; a header
      attribute as a list; `address` among the kept host names; the two transaction cases removed

## Phase 3 — docs and records

- [x] ADR-0071 (Proposed), its registry row, the next free number; `CLAUDE.md` counts 71
- [x] `.claude/rules/security.md` — `SENTRY_DATA_COLLECTION`, streamed spans, the Express capture
- [x] Register: B-66 to Closed; #190's loose ends

## Discovered

- [x] Found: 11's Express integration captures at the throw, by status code only, when
      `Sentry.init` runs before Express loads → in scope, D-04
- [x] Found: `@sentry/conventions` 0.27 defines `address`, an alias of `server.address` → in
      scope, kept as a host name with the others; a literal address under it is still dropped
      by its value

## Acceptance

- [x] AC-1 — `npm ls @sentry/node @sentry/core`
- [x] AC-2 — `sentry-release.test.ts` › "names every data category, each off (D-02)"
- [x] AC-3 — `sentry-hooks.sdk.test.ts`, four cases; with `beforeSendSpan` replaced by a
      pass-through, both span cases failed
- [x] AC-4 — `sentry-release.test.ts` › "leaves capturing a server error to errorHandler (D-04)".
      Observed in a plain Node process on 11.8.0: `Sentry.init` after Express loads (as
      `server.ts` does), 0 automatic events; before it, 1 event for an error with no status, and 0
      with the option. A control that captures explicitly counted 1. Not a test in the suite: the
      integration hooks Express at load, which a Jest module registry does not reproduce
- [x] AC-5 — no source, rule or reference doc names the removed options as current
- [x] AC-6 — moved: every span case in `sentry-scrub.test.ts` (shape only, same expectations);
      removed: "scrubs a transaction's request, user, trace data and every span" and "cleans a
      transaction's trace data and each of its spans" (no transaction event under streaming; the
      trace-context case on an error event stays)

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — `test:coverage`: unit 1358 passed; integration 273 passed, 5 skipped; thresholds met
- [x] build
- [x] OpenAPI — no drift
- [x] security delta — passed; 3 medium, none from this change
- [x] image smoke — passed
