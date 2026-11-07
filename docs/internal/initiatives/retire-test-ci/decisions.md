# Retire test:ci — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Retire `test:ci` rather than repair it

- **Status:** Accepted (the user's decision, taken at plan approval)
- **Date:** 2026-09-24

**Context.** `2026-09-24-todo-test-ci-script-defects` described two defects: dropped arguments,
and a migration step missing `--migrations-path`. Reading the files showed four problems, three
of them fatal:

- `docker-compose.test.yml` builds the production `Dockerfile`, whose runtime stage has no `src/`,
  no `__tests__/`, and no `sequelize-cli` or `jest`.
- `.env.test`'s `127.0.0.1` hosts do not reach Compose's `db` and `redis` from inside the container.
- `down -v` runs against the dev stack's own Compose project.
- Nothing calls it: CI runs the npm scripts directly.

**Decision.** Delete `scripts/test-ci.sh`, the `test:ci` npm script and `docker-compose.test.yml`.
The documented local path is the one CI mirrors: `docker compose up -d db redis rabbitmq`, `npm run
db:migrate:test`, then `npm test`. It needs only the base `docker-compose.yml`, whose init script
creates `lakira_test_db`.

**Options considered.** _Repair it._ That means pointing the app at `Dockerfile.dev`, overriding the
DB and Redis hosts, using `db:migrate:test`, forwarding arguments, and running it as its own
Compose project with no host-port clash, so that `down -v` only touches test volumes. Rejected: it
is about half a day of work, and edits to a protected file, for a command nobody runs. CI already
gives containerised parity.

**Consequences.** `tests-3-integration-tests` INT-ADR-001 named `docker-compose.test.yml`. Its
procedure still stands; the file reference does not. A dated forward note there points here.

## D-02 — Keep a way to build the production image locally

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** `test-ci.sh` was the only thing in the repo that built the production `Dockerfile`.
CI never has (ADR-0042: "the workflow contains zero docker references"). The twelve-factor audit
called that build path a strength worth preserving, though on the mistaken belief that CI used it.

**Decision.** Add `npm run docker:build` (`docker build -t lakira-backend:local .`). The production
image can then still be built and checked by hand until ADR-0039 Part 2 (TF-2) builds it in CI.

**Options considered.** _Add a Docker build job to CI now._ Deferred: `.github/` is protected, and
TF-2 will add build-and-push there as part of its own design.

## D-03 — Fix the production image, which no longer built

- **Status:** Accepted
- **Date:** 2026-09-24

**Context.** Found while verifying D-02: the first `npm run docker:build` failed. The runtime stage
runs `npm ci --omit=dev`, which triggers the `prepare` script, `husky`. Husky is a devDependency,
so it is not installed there: `sh: husky: not found`, exit 127. `prepare: husky` arrived with the
commitlint hook (`bba4e6c`, 2026-08-29). The production `Dockerfile` has not built since. Nothing
noticed, because CI never builds it and Render builds from source.

**Decision.** In the runtime stage only, run `npm pkg delete scripts.prepare` before
`npm ci --omit=dev`.

**Options considered.**

- _`npm ci --omit=dev --ignore-scripts`._ Rejected. `bcrypt` has an install script that fetches
  its native binary, so the image would build and then fail on the first password hash.
- _Make `prepare` tolerate a missing husky (`husky || true`)._ Rejected. It changes behaviour for
  every install everywhere, to fix a problem that exists only in one Docker stage.

**Consequences.** The image builds. Inside it, bcrypt hashes and verifies, `dist/server.js` is
present, and husky, jest, sequelize-cli and typescript are absent. It is still built nowhere
automatically: TF-2 (ADR-0039 Part 2) is what puts it in CI.
