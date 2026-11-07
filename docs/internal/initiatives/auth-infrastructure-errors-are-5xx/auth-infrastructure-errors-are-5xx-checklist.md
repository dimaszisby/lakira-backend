# Auth infrastructure errors are 5xx — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `5818042` (#199).

## Acceptance criteria

- **AC-1** — A token that fails verification answers 401 "Unauthorized: Invalid token", as before.
  _Why:_ the contract for an invalid JWT.
- **AC-2** — A failure of either repository lookup reaches the error handler and answers 500, and
  the error is logged. _Why:_ X61; a database blip must not sign users out silently.
- **AC-3** — A non-token error from `verify` also reaches the error handler. _Why:_ only an invalid
  token is the client's fault.
- **AC-4** — The four existing 401 cases (no header, user not found, no organization claim,
  inactive membership) and the success path are unchanged. _Why:_ no change to the contract.

## Phase 0 — kit and branch

- [x] `fix/auth-infrastructure-errors-are-5xx` cut with `--no-track` from `origin/dev` at
      `5818042`; HEAD and upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01

## Phase 1 — tests first, each seen to fail

- [x] `__tests__/unit/features/auth/infrastructure/http/authMiddleware.test.ts` — 7 cases: the
      success path, the four existing 401s, and three new ones (a failed user lookup, a failed
      membership lookup, a non-token error from `verify`). The three new cases failed: each got a 401

## Phase 2 — the fix

- [x] `src/features/shared/auth/infrastructure/http/authMiddleware.ts` per D-01: verification in its
      own `try`, a `DomainError` of kind `unauthorized` answers 401, anything else and any lookup
      failure goes to `next(error)`

## Phase 3 — gates, review, docs

- [x] Review of the diff: nothing found. Every early `return next(...)` keeps a single call of `next`
- [x] Register B-77 to Closed naming the branch; its todo closed; B-54 notes X61 as its likely cause
- [x] Notion Part 2 record "A database failure during authentication answers 500, not 401" (Open,
      P3, no frontend action; checked on frontend `dev` at `d17710b`)
- [x] #199's loose ends: the `database-tls-and-staging-refusals` kit's D-03 Accepted and README
      Done; register D-07 Accepted; B-76 and its todo name `#199 (5818042)`; "As of" `5818042`;
      B-84 records X68's CI sighting

## Discovered

- [x] Found: my first test passed `undefined` for the missing header, which a default parameter
      turned back into a token → test fixed with an explicit "no header" case; only the rerun cited

## Acceptance

Rerun of the dated run's reproduction on the built server against throwaway Postgres and Redis.

- [x] AC-1 — › answers 401 for a token that fails verification
- [x] AC-2 — › passes a failed user lookup on as itself; › passes a failed membership lookup on as
      itself. Built server: with the `users` table renamed for one request, 500, and the database
      error logged with its stack through `UserRepositorySequelize.findById` (it was a 401 and no
      log before)
- [x] AC-3 — › passes an error from verify that is not about the token on as itself
- [x] AC-4 — › authenticates a valid token; › answers 401 with no bearer token; › answers 401 for an
      unknown user, a token with no organization, an inactive membership. Built server: 200 with the
      table back

## Gates

Run on Node 24.22.0 after the last change.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0; prettier run on the touched files only
- [x] tests — `test:coverage` exit 0: unit 1485 passed; integration 286 passed, 5 skipped;
      thresholds met
- [x] build — exit 0
- [ ] OpenAPI — skipped: no route, Zod schema or `src/lib/openapi/**` touched
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no Dockerfile, dependency or start/stop change
