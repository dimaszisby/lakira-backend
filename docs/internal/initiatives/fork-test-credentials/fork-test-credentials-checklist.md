# Fork test credentials — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Checked against `origin/dev` at
`60b7520` (#121).

## Phase 0 — kit and branch

- [x] `fix/fork-test-credentials` cut with `--no-track` from `dev` at `60b7520`
- [x] This kit: README, checklist, `decisions.md` with D-01..D-03 (promoted to ADR-0051)
- [x] `saas-gold-reaudit/README.md` status set to merged in #121 (loose end of the previous task)

## Phase 1 — tests first

- [x] `__tests__/unit/bootstrap-fork.test.ts` (at the top of `__tests__/unit/`, beside
      `dockerfile.test.ts`, rather than the planned `unit/scripts/`, which does not exist). On the
      pre-change script it fails 6 of 10: `.env.test` logs in as `lakira_user` against `.env`'s
      `my-app_user`, and `my-app_user` is not a valid unquoted identifier

## Phase 2 — script

- [x] `scripts/bootstrap-fork.sh`: `DB_SLUG` (D-01); the `[Ll]akira_` rule uses it; `FILES_SHORT`
      gains `.env.test.example` and `docker/db/init/01-create-dbs.sql` (D-02); header comment and
      printed steps (`db redis rabbitmq`, then `db:migrate:test`) updated
- [x] The unit test passes, 10 of 10, and also under GNU `sed` 4.9 in a `node:24` container, as CI
      will run it

## Phase 3 — CI and docs

- [x] `.github/workflows/fork-smoke.yml` (D-03), handed over as
      `.git/fork-test-credentials-protected.patch` (`git apply --check` clean; the YAML parses into
      the intended triggers and steps; `actionlint` not installed, so the PR's own run is the check)
- [x] `docs/tutorials/fork-and-rebrand.md`: the rename table, the short-name paragraph (hyphens to
      underscores), and § 7 Verify, now the sequence the workflow runs, with a warning to verify on a
      machine or volume that never ran the upstream stack
- [x] `docs/how-to/testing/run-the-test-suites.md`: `db:migrate:test` before `npm test`
- [x] `docs/reference/ci-pipeline/pipeline-overview.md` § 4 lists the workflow
- [x] ADR-0051, its registry row, and the next free number bumped to ADR-0052

## Phase 4 — records

- [x] Todo `2026-09-29-todo-fork-test-credentials.md` → Complete, pointing here
- [x] `FINAL-AUDIT-SUMMARY.md` § 4: a C1 note says the fix landed, not yet re-audited; the table
      row stays "Reopened" until a dated run (ADR-002)

## Discovered

- [x] Found: the new unit test failed inside a fork (the script exits "Already renamed", and the
      templates no longer carry `lakira_`), which would have broken `Fork Smoke` and every
      forker's `npm test` → in scope, fixed: it runs only while `package.json` is still
      `lakira-backend`, and skips in a fork (proven both ways), as the audit-history tests do
- [x] Found: on this machine, a fresh `rabbitmq:3.13-management-alpine` container crashes on start
      (`.erlang.cookie: eacces`), with or without a new volume or `RABBITMQ_ERLANG_COOKIE`. The
      long-running `rabbitmq_queue` is unaffected, and CI runs the same image as a service. Local
      Docker only → out of scope, not filed; the local proof used the existing broker (below)
- [x] Found: a fork on a machine that ran the upstream stack reuses its database, because the
      Compose file fixes container and volume names → out of scope, already tracked as audit
      finding R12; the tutorial now warns about it

## Acceptance

- [x] **AC-1** — A fresh `--no-local` clone, bootstrapped as `my-app`, then the printed steps:
      `npm install`, `migrate:development`, `db:migrate:test` and `npm test` all exit 0 (unit 617
      passed, 4 skipped by design; integration 202 passed, 5 skipped). The database was a
      throwaway `postgres:18` with the fork's own `.env` values and init SQL, never touched by the
      upstream stack; only ports were overridden. Redis was throwaway too. RabbitMQ was the
      existing local broker (the fork does not rename broker credentials, and its queue names come
      from `APP_NAME=my-app`). The same harness with the old script fails `db:migrate:test` with
      `password authentication failed for user "lakira_user"`. _Why:_ C1's exact claim.
- [x] **AC-2** — `.env` and `.env.test` agree on DB*USER and DB_PASSWORD, the init SQL creates the
      database `.env.test` names, and no `lakira*` remains (unit test, both names). _Why:_ the
      reproduced failure.
- [x] **AC-3** — `my-app` yields `my_app_user`, `my_app_development`, `my_app_test_db`; the init SQL
      ran cleanly against Postgres. _Why:_ the tutorial's own example.
- [x] **AC-4** — The unit test fails on the pre-change script (6 of 10) and passes on the new one.
      _Why:_ a guard never seen failing proves nothing.
- [ ] **AC-5** — `Fork Smoke` is green on this PR's own run. _Why:_ the regression guard for the
      whole class; locally it could only be approximated. Pending the PR.
- [x] **AC-6** — ADR-0051 exists, is Accepted in the registry, and links back to this kit. _Why:_ a
      new CI gate and a change to generated identifiers.

## Gates

All on Node 24.21.0.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0 (after Prettier realigned a table)
- [x] build — exit 0
- [x] tests — unit 631/631 (10 new); integration 202 passed, 5 skipped
- [ ] OpenAPI — skipped: no route, schema or `src/lib/openapi/**` change
- [ ] security delta — skipped: no dependency change
