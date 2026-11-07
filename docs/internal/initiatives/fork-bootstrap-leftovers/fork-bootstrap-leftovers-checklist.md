# Fork bootstrap leftovers — Checklist

Checked against `origin/dev` at `9534687` (#218). Acceptance criteria: [the plan](fork-bootstrap-leftovers-plan.md).

## Phase 0 — kit and branch

- [x] `fix/fork-bootstrap-leftovers` cut with `--no-track` from `origin/dev` at `9534687`; HEAD
      and upstream verified
- [x] This kit: README, plan, this file, `decisions.md` with D-01 to D-09
- [x] #218's loose ends: `api-tooling-residuals` D-01 to D-09 Accepted, README Done; B-82 and
      B-90 Closed rows name #218; "As of" `9534687`
- [x] B-91 filed: `2026-10-23-todo-follow-redirects-dev-high.md`
- [x] Notion: the #218 record "The organization lists page by cursor" moved to Action needed,
      with #218 (`9534687`) as evidence, in the record and its Index row

## Phase 1 — tests first

In `__tests__/unit/bootstrap-fork.test.ts`. Run against the unchanged script, 11 failed, each for
the reason its decision names; "prints no generated secret" passed and stays as a guard.

- [x] D-01: a user's `lakira_` password and value survive; identifiers and a staging database name
      are renamed (`dev`: the password became `my_app_secret`)
- [x] D-02: no generated value in a `sed` argument (`dev`: the JWT secret line)
- [x] D-03: no `sed -i`; a mode-600 `.env` stays 600 (`dev`: the `sed -i` detection)
- [x] D-04: a run after one stopped at step 1 finishes the renames (`dev`: spec not renamed)
- [x] D-05: an `.env.test` alone gives its login to the new `.env` (`dev`: generated and copied
      over it)
- [x] D-06: the broker login is generated and shared, for each of the three names (`dev`:
      `guest`); a user's own broker login is kept and given to `.env.test`
- [x] D-07: `acme-api` gives `acme_api_*`; `lakira-api` is refused (`dev`: `acme_*`, accepted)

## Phase 2 — the script

- [x] `scripts/bootstrap-fork.sh`: `rewrite_file`, `do_sed` and `set_env_values` (D-03, D-02);
      `rename_env_identifiers` (D-01); `RENAME_TREE` (D-04); one short name (D-07); the login
      taken from `.env.test` (D-05); step 3d, the broker login (D-06); a closing message per
      secret

## Phase 3 — Fork Smoke and docs

- [x] `.git/staged-workflows/fork-smoke.yml`: the D-08 step, after the bootstrap
- [x] `docs/tutorials/fork-and-rebrand.md`: the table, the short name, the generated logins,
      Redis, rotating in place (D-05 to D-07, D-09)
- [x] `docs/how-to/development/run-postgres-in-docker.md`: `127.0.0.1` (D-09)
- [x] ADR-0051: status note (D-07, with D-01, D-04, D-06, D-08)
- [x] Both todos closed; register B-50 and B-51 to Closed, tier-5 prose updated

## Discovered

- [x] Found: the old `do_sed` rewrote a file even when nothing matched; `rewrite_file` writes only
      on a change → in scope, Phase 2 (a second run no longer touches a file's mtime)
- [x] Found in review: a re-run renames "Lakira" in a renamed file the fork later edited to hold it
      → in scope, recorded in D-04's consequences
- [x] Found: the repo's Jest config does not load in a plain `node:24` container (its custom
      reporter), so GNU parity was proven by running the script itself → recorded under Gates

## Acceptance

- [x] AC-1 — `bootstrap-fork.test.ts` › renames the identifiers in a hand-made .env, and no value
      the user chose
- [x] AC-2 — › passes no generated secret to sed as an argument; › prints no generated secret
- [x] AC-3 — › has no sed -i, and keeps the mode of a file it rewrites; GNU parity below
- [x] AC-4 — › finishes the renames a run that stopped after step 1 left
- [x] AC-5 — › gives a new .env the login of an .env.test the user filled in alone
- [x] AC-6 — › generates the broker login, the same in .env and .env.test (three names); › keeps
      a broker login the user chose; › changes nothing on a second run that finds both
- [x] AC-7 — the D-08 step, run by hand in a scratch copy: exit 0 after a real bootstrap; exit 1
      with seven named errors after `.env` was reset to the template and Postgres published on
      every interface. The full job runs in CI once the workflow is copied in
- [x] AC-8 — the tutorial's "Rotating a password in place"; no `-p <port>:<port>` left in a
      published doc
- [x] AC-9 — › `--name acme-api` derives every database identifier from "acme_api"; › refuses
      the name lakira-api
- [x] AC-10 — Gates below

## Gates

On Node 24.22.1.

- [x] typecheck: clean
- [x] lint: clean
- [x] format: `prettier --check` on every changed file, and `npm run format:check`, clean
- [x] tests: unit with coverage, 155 suites, 1619 tests passed, thresholds met; integration with
      coverage against throwaway Postgres 18 and Redis 7, 43 suites passed (2 skipped), 316 tests
      passed (6 skipped), thresholds met
- [x] build: clean
- [x] OpenAPI: `docs:openapi:check` exit 0, the spec unchanged
- [ ] security delta: skipped, no dependency changed
- [ ] image smoke: skipped, nothing the image holds changed
- [x] GNU parity: the script run through seven starting states on this Mac (BSD `sed`, BSD `awk`)
      and in `node:24` (GNU `sed` 4.9, `mawk`) gives identical results, 6113 lines, secrets masked
