# What the review of the `APP_NAME` default left open — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `6150bc8` (#222).

## Acceptance criteria

- **AC-1** — A name that fails bootstrap's rule stops the app at startup with a message naming its
  source and the rule; `lakira-backend`, `my-app` and a scoped `@acme/shop-backend` start. _Why:_
  todo item 2 (D-01).
- **AC-2** — Bootstrap and the app hold the same rule, and a test fails if they differ. _Why:_ one
  rule, D-01.
- **AC-3** — With a scoped package, the committed spec's path, title and cookie name use the name
  without its scope; this repo's spec regenerates byte for byte. _Why:_ todo item 3 (D-02).
- **AC-4** — `APP_NAME` set and different from the package name gives one `warn` line at startup
  from the server and from the worker; equal or unset gives none. _Why:_ todo item 4 (D-03).
- **AC-5** — No `@lakira.dev` address is left in the contract-test seed. _Why:_ todo item 5 (D-04).
- **AC-6** — The comments in `app-name.ts`, `zodEnv.ts` and `logger.ts`, and `configuration.md`,
  describe the load order as it is. _Why:_ todo item 6.
- **AC-7** — Fork Smoke runs the image smoke, and it passes on a bootstrapped fork. _Why:_ todo
  item 1 (D-05).

**Out of scope.** A stricter rule in `bootstrap-fork.sh`; renaming the queues or cookie of a
running deployment (the template's name passes).

## Phase 0 — kit and branch

- [x] `fix/app-name-review-leftovers` cut with `--no-track` from `origin/dev` at `6150bc8`; HEAD and
      upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-05
- [x] #222's loose ends: `npm-audit-findings` D-11 Accepted; the register's B-93 row names
      `#222 (6150bc8)`; "As of" `6150bc8`

## Phase 1 — tests first, each seen to fail

The `app-name.test.ts` cases failed to compile against `dev`'s module (no `APP_NAME_PATTERN`, no
`appNameMismatch`), so they were red by type error rather than by assertion; the two spec-path
cases failed by assertion.

- [x] `app-name.test.ts` › refuses `Acme Corp`, `my.app`, `My-App`, `my_app` from `APP_NAME` and
      from the package, naming the source (AC-1)
- [x] `app-name.test.ts` › the pattern is the one in `bootstrap-fork.sh` (AC-2)
- [x] `app-name.test.ts` › `appNameMismatch` (AC-4)
- [x] `openapi-spec-path.test.ts` › `appNameFromPackage` drops a scope and agrees with
      `resolveAppName` (AC-3)

## Phase 2 — the change

- [x] `src/config/app-name.ts`: `APP_NAME_PATTERN`, the check in `resolveAppName`,
      `appNameMismatch`, and `currentAppNameMismatch` for the entry points (D-01, D-03)
- [x] `src/server.ts`, `src/worker.ts`: one warn line on a mismatch (D-03)
- [x] `scripts/openapi-spec-path.js`, `scripts/openapi-app-name.js`: `appNameFromPackage` (D-02)
- [x] `scripts/seed-contract-tests.ts`: `@example.com` (D-04)
- [x] Comments: `app-name.ts`, `zodEnv.ts`, `logger.ts` (AC-6)
- [x] `.github/workflows/fork-smoke.yml`: the image smoke, and the scope dropped in the spec step;
      staged at `.git/` for the owner to copy (D-05)

## Phase 3 — gates, review, docs

- [x] Fork run in the scratchpad: a copy of this tree bootstrapped as `my-app`; image smoke, all
      seven checks, check 7 naming `my-app`; the workflow's spec step; `APP_NAME="Acme Corp"`
      refused with the message; the server and the worker warning on `APP_NAME=lakira-backend`
      and not on `my-app`; the package renamed `@acme/my-app` and `docs:openapi:check` passing,
      the spec still `my-app-openapi.json`, "My App API", `my-app_refresh` (AC-1, AC-3, AC-4,
      AC-7)
- [x] Review of the diff: no defect. Three tidy-ups: `currentAppNameMismatch` moved below the
      name exports, a doc comment rewrapped, the spec path built from `PACKAGE_NAME` once
- [x] Docs: `configuration.md` § Branding, `regenerate-the-openapi-spec.md`, ADR-0060 status note,
      the todo's status, register B-52 to Closed

## Discovered

- [x] Found: `logger.ts` repeated the load-order claim three times, citing `app-name.ts:1-3` → in
      scope, Phase 2 (AC-6)
- [x] Found: Express sets `my.app_refresh` and `My_App_refresh`; only the space breaks the cookie
      → in scope, D-01's context and the rule's comment say so

## Acceptance

- [x] AC-1 — `app-name.test.ts` › "the name must match bootstrap's rule"; the fork run refused
      `Acme Corp` at startup
- [x] AC-2 — `app-name.test.ts` › "is the rule bootstrap-fork.sh applies to --name"
- [x] AC-3 — `openapi-spec-path.test.ts` › "appNameFromPackage drops a scope as the app does"; the
      fork run with `@acme/my-app`; `docs:openapi:check` on this repo with no diff
- [x] AC-4 — `app-name.test.ts` › "appNameMismatch"; the fork run's server and worker lines
- [x] AC-5 — `rg '@lakira.dev' scripts` is empty
- [x] AC-6 — the comments in `app-name.ts`, `zodEnv.ts` and `logger.ts`, and `configuration.md`;
      `envManager` imports no logger, so no cycle exists, and `zodEnv` → `loadEnv` loads `.env`
      before either entry point imports the logger
- [x] AC-7 — the fork run's image smoke; in CI once `fork-smoke.yml` is copied in

## Gates

Node 24.22.1.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — clean
- [x] tests — unit with coverage 157 suites, 1677 tests; integration with coverage 43 suites
      (2 skipped), 316 tests (6 skipped), before the review's tidy-ups, which moved one export and
      a comment
- [x] build — clean
- [x] OpenAPI — valid, regenerates with no diff
- [x] image smoke — all seven checks on this repo, and on the bootstrapped fork
- [x] security delta — not run: no dependency changes
