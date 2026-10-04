# Todo — a fork's OpenAPI gate cannot pass; bootstrap ordering

- **Status:** S2, S3 and S4 fixed in kit
  [`fork-openapi-gate`](../initiatives/fork-openapi-gate/README.md) (#134,
  `0ce4511`); they stay open in the audit until a dated run confirms them (ADR-002).
  **S10 is still open (P2)** and is the only item left here
- **Created:** 2026-10-03
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 6, S2, S3, S4, S10; kit `saas-reaudit-2026-10-03` D-03 and D-05

---

## What

Four defects in `scripts/bootstrap-fork.sh`, all reproduced on a fresh clone on 2026-10-03.

- **S2 (P1).** The script rewrites `lakira-backend` in `package.json`, including the path in
  `docs:openapi:check`. `scripts/generate-openapi.ts:14`, `normalize-openapi.ts:11`,
  `validate-openapi.ts:23` and the file on disk keep `lakira-backend-openapi.json`. On the fork,
  `npm run docs:openapi:check` exits 128. `backend-ci.yml:68` runs it in the `checks` job, which
  `tests` needs, so the fork's pipeline fails on first push. `Fork Smoke` does not run this gate.
  Blocks the GOLD restatement.
- **S3 (P2).** With a `.env` made before bootstrap, as `docs/tutorials/getting-started.md` tells a
  newcomer to do, `.env` keeps `lakira_user` while `.env.test` and the init SQL are renamed.
- **S4 (P2).** The "already renamed" guard (`:107-111`) exits before the steps that create `.env`
  and `.env.test`, so a fork named `my-app` cannot run `Fork Smoke`, which uses that name.
- **S10 (P2).** Only `JWT_SECRET` is rotated. The database password is the predictable
  `<short>_password`, and Compose publishes 5432, 6379 and 5672 on all interfaces.

## Suggested fix

Give the spec filename one source of truth that bootstrap renames everywhere, or stop renaming
it. Move the `.env` and `.env.test` creation ahead of the guard and make the credential rename apply
to an existing `.env`. Generate the database password, or bind the published ports to `127.0.0.1`.
Add `docs:openapi:check`, lint and typecheck to `Fork Smoke`, so a fork's gates are proven and not
only its tests.
