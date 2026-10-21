# Log and CI leaks — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `a311214` (#204).

## Acceptance criteria

- **AC-1** — A database error whose message quotes a value, failing a background task, a queued
  job or an email use case, leaves no trace of the value in the log line, metadata or message
  text. _Why:_ X3.
- **AC-2** — No code under `src` hands the logger an error's `.message` as a string. _Why:_ X3,
  and the next site.
- **AC-3** — An address in a URL's path, plain or `%40`-encoded, reaches neither Sentry (event and
  span URLs) nor the access log. _Why:_ X5.
- **AC-4** — `backend-ci.yml` runs with a read-only `GITHUB_TOKEN`, and every job still passes.
  _Why:_ X6.

## Phase 0 — kit and branch

- [x] `fix/log-and-ci-leaks` cut with `--no-track` from `origin/dev` at `a311214`; HEAD and
      upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-03

## Phase 1 — tests first, each seen to fail

- [x] `__tests__/unit/utils/error-message-masking.test.ts`: the real logger, a Sequelize
      `DatabaseError` quoting an address, through `runInBackground`, a failed publish in
      `ScheduleEmailVerification`, and a queued job parked by `RabbitMQConsumer`. On the old code
      all three wrote the address (AC-1)
- [x] `architecture.test.ts` › an error reaches the logger as the object, matching across line
      breaks. On the old code it named every site, and on the first fixed tree it found one more
      (Discovered) (AC-2)
- [x] `sentry-scrub.test.ts` (event URL, plain and `%40`; span URL) and `access-log.test.ts`
      (both spellings): all four failed on the old code (AC-3)

## Phase 2 — the fix

- [x] `logger.ts` `loggableErrorMessage` and `loggableErrorStack`; the error object passed at
      `background-tasks.ts`, `RabbitMQConsumer.ts` (three), `RequestEmailVerification.ts`,
      `RequestPasswordReset.ts` (three), `InviteUserToOrganization.ts`,
      `ScheduleEmailVerification.ts` and `loginLockout.ts`
- [x] `src/utils/mask-emails.ts`; `cleanUrl` and the access log apply it
- [x] `backend-ci.yml` `permissions: contents: read`, written in the scratchpad; `actionlint`
      clean; handed over as a `cp` from `.git/backend-ci.yml-fix-log-and-ci-leaks`

## Phase 3 — gates, review, docs

- [x] Review of the diff: no defect. `runInBackground` keeps a stack, masked
      (`loggableErrorStack`), since a nested error is reduced without one; two tests that mock
      the logger gained the helpers
- [x] ADR-0059 Status note; `.claude/rules/security.md` § Sensitive Data Handling
- [x] Register: B-81 names this branch for X3, X5, X6 and keeps seven items; "As of" `a311214`
- [x] #204's loose ends: B-85's Closed row and todo name `#204 (a311214)`; `tests-in-parallel`
      README Done and AC-5 filled in (2m45s)

## Discovered

- [x] Found: `loginLockout.ts` logged a Redis error's message as a string too, a site the audit's
      list did not name → in scope, fixed; the guard found it

## Acceptance

- [x] AC-1 — `error-message-masking.test.ts`, three tests
- [x] AC-2 — › passes no error's message as a string anywhere under src; › recognises the idiom it
      refuses, wrapped or not
- [x] AC-3 — › masks an address in the URL's path, plain or percent-encoded; › masks an address
      in a span's URL path; › masks an address in the path (both spellings)
- [ ] AC-4 — this PR's CI run, green with the read-only token

## Gates

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file and the new workflow: clean
- [x] tests — `test:unit:coverage` 149 suites, 1525 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 299 tests passed (6 skipped),
      thresholds met
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean
- [x] actionlint — clean (shellcheck pass off: not installed)
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
