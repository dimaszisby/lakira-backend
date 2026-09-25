# Commands

Every script below exists in `package.json` as of 2026-09-24 — nothing checks this automatically,
so update this page in the same change as any script. Node 24 (`.nvmrc`) is the supported
version and what CI runs; migrations also work on newer runtimes since sequelize-cli paths are
passed explicitly rather than through a `.sequelizerc`.

## Daily loop

```bash
docker compose up -d db redis   # infrastructure
npm run migrate:development     # apply migrations
npm run dev                     # tsx watch, port 5000
```

| Command                | Does                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `npm run dev`          | Dev server with hot reload                                                                    |
| `npm run build`        | Compile to `dist/` and rewrite path aliases                                                   |
| `npm run docker:build` | Build the production `Dockerfile` as `lakira-backend:local` — CI does not build it yet (TF-2) |
| `npm start`            | Production server from `dist/`                                                                |
| `npm run worker`       | RabbitMQ consumer process (`worker:dev` for watch mode)                                       |

## Quality gates

Run these before pushing; CI runs the same four.

| Command                      | Does                                    |
| ---------------------------- | --------------------------------------- |
| `npm run lint`               | ESLint (`lint:fix` to autofix)          |
| `npm run typecheck`          | `tsc --noEmit`                          |
| `npm run format:check`       | Prettier (`format:write` to fix)        |
| `npm run docs:openapi:check` | Regenerate, validate, and fail on drift |

## Tests

```bash
npm test        # unit, then integration — the canonical order
```

| Command                                | Needs    | Does                                      |
| -------------------------------------- | -------- | ----------------------------------------- |
| `npm run test:unit`                    | —        | Unit suites, no database                  |
| `npm run test:integration`             | Postgres | Full wiring against a real DB             |
| `npm run test:e2e`                     | Postgres | End-to-end                                |
| `npm run test:coverage`                | Postgres | Both layers with coverage                 |
| `npm run integration:local`            | Postgres | Migrate the test DB, then integration     |
| `npm run test:unit:security-framework` | —        | Validates the security audit docs' schema |

A single file:

```bash
npx jest --runInBand --selectProjects unit -- path/to/file.test.ts
```

> **Do not run `jest --selectProjects unit integration` in one pass.** Integration needs its DB
> lifecycle; combining the projects under `SKIP_DB_LIFECYCLE=true` produces failures that are an
> artefact of the invocation, not real. Use `npm test`, which runs them in sequence.

### Contract tests

Require a built server on port 4000 plus seeded fixtures. `contract:local:*` orchestrates all of
it; the `test:contract:*` scripts assume a server is already up.

| Command                                    | Does                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `npm run contract:local:quick`             | Build, seed, boot, run Schemathesis (fastest profile)    |
| `npm run contract:local:gate`              | Profile used as the CI gate                              |
| `npm run contract:local:full`              | Full fuzzing profile                                     |
| `npm run test:smoke`                       | Smoke-test a deployed environment (`SMOKE_BASE_URL`)     |
| `npm run test:contract:schemathesis:local` | Schemathesis only, against a running server              |
| `npm run seed:contract-tests`              | Write deterministic fixtures to `tmp/contract-seed.json` |

Schemathesis needs Python ≥ 3.11:

```bash
python3.12 -m venv .venv-schemathesis
.venv-schemathesis/bin/pip install -r tests/contract/schemathesis/requirements.txt
```

## Migrations

Scripts are named after the **full** environment (`development`, not `dev`):

| Command                                          | Does                             |
| ------------------------------------------------ | -------------------------------- |
| `npm run migrate:development`                    | Apply pending migrations         |
| `npm run migrate:development:undo`               | Roll back the last migration     |
| `npm run migrate:development:undo:all`           | Roll back everything             |
| `npm run db:migrate:test`                        | Migrate the test DB (used by CI) |
| `npm run migrate:staging` / `migrate:production` | Same, per environment            |

`npm run migrate` and `npm run migrate:undo` are unqualified aliases that target **development**.

> Earlier documentation referenced `npm run migrate:dev` and `npm run migrate:undo:dev`. Those
> scripts have never existed — the correct names are above.

## Security

| Command                          | Does                                                     |
| -------------------------------- | -------------------------------------------------------- |
| `npm run security:delta:check`   | Dependency vulnerability delta                           |
| `npm run security:gate:evaluate` | Evaluate findings against `security/ci-gate-policy.json` |
| `npm run security:delta:gate`    | Both, in order                                           |
| `npm run security:audit:init`    | Scaffold a dated audit run from the template             |

## Documentation

| Command                         | Does                                                   |
| ------------------------------- | ------------------------------------------------------ |
| `npm run docs:openapi:generate` | Regenerate, normalise, and validate the OpenAPI spec   |
| `npm run docs:openapi:validate` | Validate the spec on disk without regenerating it      |
| `npm run docs:openapi:check`    | Regenerate, validate, and fail if it differs from HEAD |

The spec is a build artifact — see [`api/README.md`](./api/README.md).

## Other scripts

Less common, but real — several are what CI or deployment calls.

| Command                                                                           | Does                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run start:test`                                                              | Run the built server for tests (`ALLOW_TEST_HTTP_SERVER=true`); used by CI |
| `npm run start:staging`                                                           | Migrate, then run the built server with `NODE_ENV=staging`                 |
| `npm run staging` / `npm run prod` / `npm run worker:staging`                     | Run from source via `ts-node` against `.env.staging` / `.env.production`   |
| `npm run test:dev`                                                                | Jest in watch mode against local Postgres                                  |
| `npm run test:unit:coverage` / `npm run test:integration:coverage`                | One project with coverage thresholds; used by CI                           |
| `npm run lint:tests`                                                              | ESLint over `__tests__/` only                                              |
| `npm run jest`                                                                    | The ESM Jest launcher the `test:*` scripts call; not usually run directly  |
| `npm run test:contract:schemathesis:local:{quick,gate,full,exploratory}`          | Schemathesis at one profile, against a running server                      |
| `npm run contract:local:exploratory`                                              | Build, seed, boot, run Schemathesis at the exploratory profile             |
| `npm run test:contract:schemathesis:staging`                                      | Schemathesis against staging                                               |
| `npm run migrate:test`                                                            | Apply migrations to the test database (`.env.test`)                        |
| `npm run migrate:{staging,production}:ci`                                         | Apply migrations in CI/deploy, env from the platform                       |
| `npm run migrate:{test,staging,production}:undo`                                  | Undo the last migration in that environment                                |
| `npm run migrate:undo:all` / `npm run migrate:{test,staging,production}:undo:all` | Undo **every** migration — destructive                                     |

## Git hooks

Managed by husky (`core.hooksPath` is `.husky/_`; `npm run prepare` re-installs them).

| Hook         | Runs                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| `pre-commit` | Rejects staged `.env*` files (except `*.example`), then `npm run lint-staged` |
| `commit-msg` | `commitlint --edit` against `commitlint.config.mjs`                           |

`commit-msg` enforces Conventional Commits. It rejects a malformed message, not a wrong one — see
`.claude/rules/workflow.md` for why commit messages should be handed over as a file and applied with
`git commit -F <path>` rather than pasted at the prompt.
