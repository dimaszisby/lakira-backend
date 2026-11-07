# The app takes its name from the package — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan.

## Phase 0 — kit and branch

- [x] `fix/app-name-from-package` cut with `--no-track` from `origin/dev` at `68522a7`; HEAD and
      upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01, written before any code

## Phase 1 — reproduce, then tests first

- [x] U2 reproduced on a scratch fork bootstrapped as `acme-api`, read before it is touched: with
      no `.env` and no `APP_NAME`, `src/config/app-name.ts` gives the template's names —
      `lakira-backend | lakira | Lakira`
- [x] `__tests__/unit/config/app-name.test.ts` — new cases for AC-1 to AC-3, shown failing on the
      current module — the suite did not compile: `resolveAppName` and `readPackageName` did not
      exist

## Phase 2 — the fix

- [x] `src/config/app-name.ts` — the name comes from `APP_NAME` when set and not blank, otherwise
      from `package.json`; no literal fallback; header comment updated
- [x] `scripts/image-smoke.sh` — check 7: the image, started with no `APP_NAME`, logs the package
      name as `service`

## Phase 3 — review, then docs

- [x] `code-reviewer` subagent, told what C2 and U2 claim and not what the fix does — U2 closed;
      C2 kept open-progressed on the working-directory lookup, fixed in D-03
- [x] D-01 and D-03 promoted to `docs/explanation/decisions/adr-0060-the-app-takes-its-name-from-its-package.md`,
      registry row, ADR count in `CLAUDE.md`; status note on ADR-0024
- [x] Dated note on `saas-audit-closeout` D-01
- [x] `docs/reference/configuration.md`, `docs/tutorials/fork-and-rebrand.md`, `README.md`,
      `.env.example` (comment only), and the header comment of `scripts/bootstrap-fork.sh`
- [x] `docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md` — C2 note; the U2 todo to Fixed

## Discovered

- [x] Found: `ts-jest` does not compile `import.meta` in `src/` (TS1343), so the module could not
      locate `package.json` relative to itself → in scope, it is found from the working directory
      as `.env` is (D-02)
- [x] Found in review: the working directory alone makes the name depend on where the process is
      started → in scope, the entry script's own package is read first (D-03); a blank name after
      the scope is dropped is refused; the read error keeps its cause
- [x] Found in review: CI does not run the image smoke on a fork, names are not validated, a
      scoped name is half supported, seed emails keep `@lakira.dev` → out of scope, filed as
      `docs/internal/todos/2026-10-07-todo-app-name-review-leftovers.md`
- [x] Found in review: the fork tutorial, the README and the bootstrap header said the script's
      short name names the queues; it does not → in scope, corrected with the other docs

## Acceptance

- [x] **AC-1** — With `APP_NAME` unset, the app's name is the `name` in `package.json`. The test
      reads the expected value from `package.json`, so it passes on a fork as well.
      _Why:_ finding U2.
- [x] **AC-2** — A set `APP_NAME` wins, as before. A blank or whitespace-only `APP_NAME` counts as
      unset.
      _Why:_ the override is the documented interface, and an empty platform variable must not
      blank the cookie and queue names.
- [x] **AC-3** — A scoped package name `@acme/shop-backend` gives `shop-backend`. With no variable
      and a `package.json` that is missing, unreadable or has no name, the module throws an error
      naming the file.
      _Why:_ the name becomes a cookie name and queue names, and no fixed fallback may come back.
- [x] **AC-4** — The production image, started with no `APP_NAME`, logs
      `"service":"<package name>"`. Check 7 passes on the template (`lakira-backend`) and on the
      scratch fork's image (`acme-api`).
      _Why:_ U2 is about the deployed image; a unit test cannot show the file is where the build
      leaves it.
- [x] **AC-5** — The template is unchanged: the committed OpenAPI spec is byte-identical and every
      existing test passes untouched.
      _Why:_ lakira-frontend syncs the spec from `dev`.
- [x] **AC-6** — On the scratch fork, the same run that gave the template's names in Phase 1 gives
      `acme-api`, `acme-api` and `Acme Api`. Run from the fork's directory; from an empty directory
      it throws and names the path (D-02). After D-03, with the entry script inside the fork and
      the process started from a directory holding another `package.json`, it is still `acme-api`.
      _Why:_ the grader's own case, reproduced and not judged.

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — unit 854 of 854; integration 220 passed, 5 skipped
- [x] build
- [x] OpenAPI — `src/config/app-name.ts` feeds the spec; the committed file is unchanged
- [x] image smoke — `scripts/image-smoke.sh` changed; 7 of 7 on the template, and on the scratch
      fork's image
- [x] security delta — skipped: no dependency added, upgraded or removed
