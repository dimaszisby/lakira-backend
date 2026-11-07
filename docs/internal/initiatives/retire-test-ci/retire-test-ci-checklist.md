# Retire test:ci — Checklist

Lean kit: no plan, so the acceptance criteria are stated here.

## Acceptance criteria

- **AC-1** — Nothing tracked references `test:ci`, `test-ci.sh` or `docker-compose.test.yml` except
  dated records (audits, archive, closed kits, incidents, todos), which stay as written.
  _Why:_ a doc pointing at a deleted command is exactly the stale-doc problem #109 fixed.
- **AC-2** — `npm run docker:build` builds the production image. Checked by the exit code, and by
  the image existing afterwards.
  _Why:_ [D-02](decisions.md), so the only local build path is not lost silently.
- **AC-3** — The documented host workflow runs green exactly as written:
  `docker compose up -d db redis rabbitmq`, `npm run db:migrate:test`, then `npm test`.
  _Why:_ it becomes the only documented way, so it has to work as written.
- **AC-4** — `bootstrap-fork.sh --name tmp-app` still completes, exit 0, on a scratch export of the
  working tree (never on the tree itself).
  _Why:_ it listed both deleted files.

## Work items

- [x] `scripts/test-ci.sh` — deleted
- [x] `package.json` — `test:ci` removed, `docker:build` added
- [ ] `docker-compose.test.yml` — `git rm` in the user's handover (protected file; not run here)
- [x] `scripts/bootstrap-fork.sh` — both files dropped from `FILES_FULL`, `FILES_SHORT` and the
      header comment
- [x] `Dockerfile.dev` — comment no longer claims to serve `test:ci`
- [x] `docs/reference/commands.md` — `test:ci` row removed, `docker:build` added
- [x] `docs/how-to/development/run-postgres-in-docker.md` § 0 — the host-run workflow
- [x] `README.md`, `docs/tutorials/fork-and-rebrand.md` — the bootstrap file lists
- [x] `docs/reference/environments.md` — the Postgres-version note
- [x] `docs/internal/initiatives/tests-3-integration-tests/decisions.md` — dated forward note on
      INT-ADR-001
- [x] `docs/internal/audits/twelve-factor/audit-2026-08-17.md` — TF-15 closed
- [x] `docs/internal/todos/2026-09-24-todo-test-ci-script-defects.md` — closed

## Out of scope

- A Docker build in CI (TF-2 / ADR-0039 Part 2; `.github/` is protected).
- The unused `staging` / `prod` / `start:staging` / `worker:staging` scripts (TF-13).

## Discovered

- [x] Found: **the production `Dockerfile` did not build.** `npm ci --omit=dev` ran `prepare:
husky`, a devDependency, and exited 127. It had been broken since `bba4e6c` (2026-08-29),
      unnoticed because CI never builds the image. → in scope as [D-03](decisions.md), a one-line fix
      in the runtime stage. AC-2 could not pass without it.
- [x] Found: ADR-0039's Consequences said the image "is currently built only by
      `scripts/test-ci.sh` and `docker-compose.test.yml`". → in scope: a dated note in place, since
      the decision itself is unchanged.
- [x] Found: `bootstrap-fork.sh`'s `do_sed` already skips missing files, so removing the entries
      is tidy-up, not a fix. Confirmed by AC-4.

## Acceptance

- [x] AC-1 — `git grep` for the three names outside dated records (audits, archive, incidents,
      todos, kits) leaves four hits: ADR-0024 and ADR-0040 (records quoting their day), ADR-0039 (now
      annotated), and the how-to's retirement note. `docker-compose.test.yml` itself goes in the
      user's `git rm`
- [x] AC-2 — `npm run docker:build` exit 127 on the unmodified `Dockerfile`, exit 0 after D-03.
      Inside the image: bcrypt hashes and verifies, `dist/server.js` is present, and husky, jest,
      sequelize-cli and typescript are absent. It still runs as `USER node` under `dumb-init`
- [x] AC-3 — `docker compose up -d db redis rabbitmq` exit 0, `npm run db:migrate:test` exit 0,
      `npm test` exit 0: unit 602/602, integration 196 passed, 5 skipped
- [x] AC-4 — `bootstrap-fork.sh --name tmp-app` on a working-tree export: exit 0; `package.json` is
      renamed, and `docker:build` now tags `tmp-app:local`

## Gates

Commands and conditions live in `.claude/rules/workflow.md` § Gates are named, not asserted.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0
- [x] tests — exit 0 (AC-3)
- [x] build — exit 0
- [ ] OpenAPI — skipped: no route or schema change
- [ ] security delta — skipped: no dependency change

## Review

- **Outcome:** `test:ci`, its script and its Compose override are retired; the documented test
  path is the one CI mirrors, and it runs green as written.
- **Bigger than planned:** keeping a production-image build path (D-02) exposed that the production
  image had not built for four weeks. It is fixed (D-03) and verified inside the image, but nothing
  builds it automatically until TF-2.
- **Left for the user:** `git rm docker-compose.test.yml` (protected file).
