# Logger polish — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `90d6f6d` (#208).

## Acceptance criteria

- **AC-1** — A thrown string reaches the 500 path and is logged as `Error Occurred: <the string>`,
  never `undefined`. _Why:_ U3.
- **AC-2** — Every record that carries an error has `service` and `release` from one
  `DEFAULT_META`, whichever of the three paths built it. _Why:_ U3.
- **AC-3** — `logger.ts` exports no `summarizeError` and declares no `LEVEL_SYMBOL`. _Why:_ U3.
- **AC-4** — A nested error's stack still does not appear. _Why:_ ADR-0059 decision 4, kept (D-02).
- **AC-5** — Every gate passes, and the OpenAPI spec is unchanged. _Why:_ no contract change.

## Phase 0 — kit and branch

- [x] `fix/logger-polish` cut with `--no-track` from `origin/dev` at `90d6f6d`; HEAD and upstream
      verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-03
- [x] #208's loose ends: `v6-small-items` D-01 to D-05 Accepted, README Done; the register's B-35
      Closed row names `#208 (90d6f6d)`; "As of" `90d6f6d`

## Phase 1 — tests

- [x] `error-log-lines.test.ts` › a thrown string is named in the server-error line (AC-1), seen to
      fail first
- [x] `logger-error-payload.test.ts` › each path that carries an error keeps the default fields
      (AC-2), a guard
- [x] `logger-error-payload.test.ts` › writes no stack for an error nested in metadata (AC-4); no
      test pinned it before, a guard

## Phase 2 — the change

- [x] `src/utils/logger.ts`: `DEFAULT_META` (D-01); `summarizeError` not exported; `LEVEL` for
      `LEVEL_SYMBOL`
- [x] `src/shared/middleware/error.ts`: `loggableErrorMessage(err)` in the server-error line (D-03)

## Phase 3 — gates, review, docs

- [x] Review of the diff: no defect. Winston copies `defaultMeta` into each record and does
      not mutate it, so one shared constant is safe
- [x] Register: B-36 to Closed, naming the branch
- [x] Docs: no reference page names the removed identifiers or the `undefined` line
- [x] Notion Part 2: none

## Discovered

- [x] Found: `error.test.ts` mocks the logger module, and its mock had no `loggableErrorMessage`, so
      seven 5xx tests failed with "not a function" → in scope; the mock gains the helper's rule for
      a non-database error

## Acceptance

- [x] AC-1 — `error-log-lines.test.ts` › names a thrown value that is not an Error; failed first
      with `Error Occurred: undefined`
- [x] AC-2 — `logger-error-payload.test.ts` › keeps the default fields on every record that carries
      an error
- [x] AC-3 — `grep -n "export function summarizeError\|LEVEL_SYMBOL" src/utils/logger.ts` is empty
- [x] AC-4 — `logger-error-payload.test.ts` › writes no stack for an error nested in metadata
- [x] AC-5 — the gates below

## Gates

Node 24.22.0; integration against throwaway Postgres 18 and Redis 7, migrated with `migrate:test`.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 150 suites, 1540 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 303 tests passed (6 skipped),
      thresholds met
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
