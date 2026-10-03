# Todo — a fresh fork's `npm test` fails: `.env.test` keeps the upstream database credentials

- **Status:** Complete (2026-09-29) — delivered by the
  [`fork-test-credentials`](../initiatives/fork-test-credentials/README.md) kit (ADR-0051). The
  fix was **confirmed by the dated run of 2026-10-03** (C1 closed-confirmed; the printed flow was
  executed through `npm test`). What that run found beside it is in
  `2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md`
- **Created:** 2026-09-29
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-09-29.md` §4.1 C1, §5; kit `saas-gold-reaudit` D-03

---

## What

`scripts/bootstrap-fork.sh` renames `lakira_` to `<short>_` in `.env.example` and copies it to
`.env`, so Compose creates role `<short>_user`. It does not rewrite `.env.test.example` or
`docker/db/init/01-create-dbs.sql`, so `.env.test` logs in as `lakira_user`, which does not exist
in the fork's database. Reproduced on 2026-09-29: `password authentication failed for user
"lakira_user"`. Invisible on any machine already running the Lakira stack, since `lakira_user`
exists there on the same port.

Also in the same Verify step: the printed steps and `docs/tutorials/fork-and-rebrand.md` never run
`npm run db:migrate:test`, and start no RabbitMQ although a queue integration test needs one.

## Suggested fix

- Rewrite the test credentials too, or have `.env.test` take them from `.env`.
- Build database identifiers from the short name with `-` replaced by `_` (`my-app_test_db` is
  invalid unquoted SQL).
- Add `db:migrate:test` and `rabbitmq` to the printed steps and the tutorial.
- A CI job: `git archive` → bootstrap → `npm test` on a clean database. Nothing else catches this.

Then a new dated audit run can restate GOLD (ADR-008).
