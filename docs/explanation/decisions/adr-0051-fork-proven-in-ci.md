# ADR-0051 — A fork is proven in CI, and its database identifiers are underscore slugs

- **Status:** Accepted
- **Date:** 2026-09-29
- **Related:** Closes the regression that reopened SaaS-readiness caveat C1
  (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 4.1, § 5). Complements
  `scripts/bootstrap-fork.sh` and `docs/tutorials/fork-and-rebrand.md`.
- **Origin:** `D-01`..`D-03` in the fork-test-credentials kit —
  [`fork-test-credentials`](../../internal/initiatives/fork-test-credentials/decisions.md)

---

## Context

`bootstrap-fork.sh` turns this template into a fork: it renames identifiers, writes `.env` and
`.env.test`, and prints the steps that end in `npm test`. On 2026-09-29 a fork dry-run showed those
steps failing on a fresh machine. The script renamed the database user in `.env.example`, from which
Compose creates the database role, but not in `.env.test.example` or in the SQL that creates the test
database. `.env.test` therefore logged in as `lakira_user`, a role the fork's database never has
(`password authentication failed for user "lakira_user"`).

The caveat had been marked closed a month earlier. It failed silently because nothing ever ran a
fork, and because the failure hides on any machine that runs the upstream stack: there, `lakira_user`
exists in the database on the same port, so a fork's tests pass against the wrong database.

The same fix exposed a second defect. The script's short name keeps hyphens, and the tutorial's own
example, `my-app`, would make the init SQL read `CREATE DATABASE my-app_test_db;`, which is invalid
unquoted.

## Decision

1. **Database identifiers use an underscore slug of the short name.** `DB_SLUG` is the short name
   with `-` replaced by `_`, and only the rule that writes `lakira_` identifiers uses it. `my-app`
   gives `my_app_user` and `my_app_test_db`; unhyphenated names are unchanged. Queue names and
   display names keep the short name as before.
2. **The test chain is renamed at bootstrap.** `.env.test.example` and
   `docker/db/init/01-create-dbs.sql` are rewritten with the rest, before `.env.test` is copied from
   its template, so `.env`, `.env.test` and the init SQL agree.
3. **A `Fork Smoke` workflow proves it on every push.** `.github/workflows/fork-smoke.yml` runs
   `bootstrap-fork.sh --name my-app` on the checkout, starts `db redis rabbitmq` from the fork's own
   Compose file, then runs `migrate:development`, `db:migrate:test` and `npm test`: the steps the
   script prints. It has the same triggers as `backend-ci.yml` and no path filter.
4. **A unit test pins the file agreement.** `__tests__/unit/bootstrap-fork.test.ts` runs the real
   script in a scratch copy and asserts that the three files agree, that the identifiers are valid
   unquoted, and that no `lakira_` survives in them. It failed on the previous script.

## Options considered

- **Derive the test credentials from `.env` at load time.** Rejected: it would change `loadEnv` for
  every developer, and couple the test database to the development one, to fix a bootstrap-time
  problem.
- **Quote the identifiers in the init SQL.** Rejected: every later hand-written query against a
  hyphenated database would need quoting too.
- **Service containers in the smoke job, as `backend-ci.yml` uses.** Rejected: their credentials are
  fixed in YAML, which skips exactly the chain under test (bootstrap → `.env` → Compose →
  `.env.test`).
- **Refuse hyphenated names.** Rejected: the tutorial recommends one (`my-app`).
- **A path filter on the script and the env templates.** Rejected: a fork's `npm test` can break
  from anywhere, such as a new test that needs a service, or a new required env key.
- **A job inside `backend-ci.yml`.** Rejected: its own workflow runs in parallel, and can be made a
  required check on its own.

## Consequences

- A hyphenated fork's database names differ from its package name (`my_app_*` for `my-app`).
- Roughly four to six minutes of CI per push. Making `Fork Smoke` a required check is a
  branch-protection setting, outside the repository.
- A new file that carries a `lakira_` identifier must be added to `FILES_SHORT`. The smoke job
  catches an omission anywhere in the test chain, and the unit test catches it in the three files
  it reads.
- Not addressed: the Compose file fixes its container and volume names, so on a machine that ran
  the upstream stack a fork reuses the upstream database. The tutorial says to verify on a clean
  machine or volume; changing the names is tracked separately (audit finding R12).

## Links

- `scripts/bootstrap-fork.sh`, `.github/workflows/fork-smoke.yml`,
  `__tests__/unit/bootstrap-fork.test.ts`
- `docs/tutorials/fork-and-rebrand.md` § 7
- `docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 5
