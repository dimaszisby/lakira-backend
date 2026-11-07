# Fork and rebrand

Turn this template into your own project. One script does the mechanical part; this walks through
what it changes and what you still have to decide.

## 1. Take a copy

```bash
git clone https://github.com/<owner>/lakira-backend.git my-app
cd my-app
rm -rf .git && git init && git add -A && git commit -m "chore: initial commit from template"
```

Dropping `.git` gives you a clean history. Keep it instead if you want to pull upstream fixes
later. Note that `bootstrap-fork.sh` records `git rev-parse HEAD` in `FORKED-FROM.md`: after the
re-init above that is your own first commit, not the upstream one. To record the upstream SHA, run
step 2 before dropping `.git`.

## 2. Rebrand

```bash
./scripts/bootstrap-fork.sh --name my-app
```

The name must match `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` — lowercase, digits, single hyphens between
them, starting with a letter. The
script rejects anything else, deliberately: the name is interpolated into `sed` patterns, and a
`/` or `|` would break them. It also rejects a name that contains `lakira` (`lakira-x`,
`my-lakira`): the renames replace that word wherever it stands, so they would match their own
output. `lakira` itself, with or without `-backend`, is accepted.

It is idempotent: running it twice changes nothing, except that a second run creates `.env` or
`.env.test` if they are missing, as on a fresh checkout of your fork, and finishes a rename that
an interrupted run left part-way. A fork is renamed once. A later run with a different `--name`
keeps the name the tree already has and says so. No secret it generates is ever a command-line
argument, where another user on the machine could read it from the process list.

What it does:

|                                  |                                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lakira-backend` → `my-app`      | `package.json`, `package-lock.json`, `.env.example`, CI workflows                                                                                        |
| Renames the OpenAPI spec         | `docs/reference/api/lakira-backend-openapi.json` → `my-app-openapi.json`, and the docs that name it; the scripts take the filename from the package name |
| `lakira` → `my-app` (short name) | database names and CI database references                                                                                                                |
| `lakira_` → `my_app_`            | database users and names in `.env.example`, `.env.test.example` and the test-database init SQL                                                           |
| Rotates `JWT_SECRET`             | in `.env`, created from `.env.example` if absent                                                                                                         |
| Generates the database password  | replaces the template's `my_app_password` in `.env`, in `DB_PASSWORD` and the development and test URLs                                                  |
| Copies the login to `.env.test`  | `DB_USER`, `DB_PASSWORD` and `TEST_DATABASE_URL` take the user and password of `.env`, whatever user that is                                             |
| Generates the broker login       | replaces `guest`/`guest` in `.env` with `RABBITMQ_USER=my_app` and a generated `RABBITMQ_PASSWORD`; `.env.test` takes the same pair                      |
| Sets `APP_NAME=my-app`           | in `.env`, for local runs; a deployment does not need it (see below)                                                                                     |
| Creates `.env.test`              | from the renamed `.env.test.example`, so it logs in as the user Compose creates from `.env`                                                              |
| Renames an existing `.env`       | if you copied `.env` or `.env.test` from the templates first, their `lakira_` database users and names are renamed; no value you set is touched          |
| Renames the Compose names        | containers, network and volumes take the `my_app_` prefix (`my_app_postgres_db`, `my_app_db_data_volume`), so the fork never shares the template's data  |
| Removes `docs/internal/`         | the upstream project's working material, and turns each Markdown link into it into its text — pass `--keep-internal` to keep both                        |
| Writes `FORKED-FROM.md`          | recording `git rev-parse HEAD` (see step 1)                                                                                                              |

The short name is the full name minus a trailing `-backend`, so `my-app-backend` becomes `my-app`
and `my-app-api` stays `my-app-api`. It is the one `src/config/app-name.ts` derives when the app
takes its name from `APP_NAME` or the package name, so the database, the queues, the cookie and
the API title all agree. Database users and names use it with hyphens turned into underscores
(`my_app_user`, `my_app_test_db`), because the test database is created by plain SQL, where a
hyphen is a syntax error. Before 2026-10-23 the script also stripped `-api`, so a fork bootstrapped
earlier as `my-app-api` has `my_app_*` databases; it keeps them, since a renamed tree is not
renamed again.

## 3. Check what it could not reach

The script covers file contents. These are yours:

- **`.env` and `.env.test` are the only env files it writes.** Set a fresh `JWT_SECRET` in every
  deployed environment (staging, production) yourself. `APP_NAME` is optional there: a deployment
  with no `APP_NAME` is named after your package, which the script has renamed. If you do set it,
  set it to your own name, since a set value wins.
- **The database and broker logins are generated once.** A later run keeps the logins of an `.env`
  that is in use, and so do the containers: a Docker volume created before a password changed
  keeps the old login, and the API then fails with `password authentication failed` (Postgres) or
  `ACCESS_REFUSED` (RabbitMQ). `docker compose down -v` removes both volumes, with their data, so
  the next `up` creates them from `.env`. To keep the data, rotate in place (below). A password
  you set yourself is kept, and `.env.test` takes it together with your `DB_USER`; if it has
  characters outside letters, digits and `._~-`, copy the user and the password into `.env.test`
  by hand, since the script will not. An `.env` with no `DB_PASSWORD` line gets none: the script
  generates a password only in place of the template's. If you filled in `.env.test` before
  creating `.env`, the new `.env` takes that database login instead of generating one, and the
  script says so.
- **Redis keeps no password.** The Compose file publishes the database, Redis, RabbitMQ and
  Mailpit on `127.0.0.1` only, so they are reachable from your machine and not from the network.
  Redis also refuses input that looks like an HTTP request, so a web page cannot talk to it
  through your browser. Give every service real credentials wherever it is deployed; startup
  refuses `guest` on the broker when `NODE_ENV=production` (ADR-0036).
- **The issue tracker is files, not settings.** The script renames the repository in
  `SECURITY.md` and in the issue forms' security link (`.github/ISSUE_TEMPLATE/config.yml`), but
  the owner in both is still `dimaszisby`: change it to yours. Then turn on private vulnerability
  reporting in your repository's settings, and run `npm run labels:sync -- --apply` once, since a
  fork copies `.github/` but not the labels ([`issue-tracker.md`](../reference/issue-tracker.md)).

### Rotating a password in place

A fork bootstrapped before the script generated a password still has `my_app_password` and
`guest`/`guest`. To change either without losing the data in its volume, change it in the running
service first, then in both env files:

```bash
docker compose exec db psql -U my_app_user -d postgres -c "ALTER ROLE my_app_user PASSWORD 'new-password'"
docker compose exec rabbitmq rabbitmqctl add_user my_app 'new-password'
docker compose exec rabbitmq rabbitmqctl set_user_tags my_app administrator
docker compose exec rabbitmq rabbitmqctl set_permissions -p / my_app '.*' '.*' '.*'
docker compose exec rabbitmq rabbitmqctl delete_user guest
```

Then set the new values in `.env` (`DB_PASSWORD` and the development and test URLs;
`RABBITMQ_USER` and `RABBITMQ_PASSWORD`) and the same in `.env.test`. To change a broker password
whose user stays, `rabbitmqctl change_password <user> '<new-password>'` is the one command. The
shell keeps commands in its history, so clear the lines that hold a password afterwards.

- **`LICENSE`** still names the original author.
- **`README.md`** still describes Lakira's domain — metrics, logs, categories.
- **The domain model itself.** `metrics`, `metric_logs`, `metric_categories`, and
  `metric_settings` are a metric-tracking product. Auth, organizations, memberships, and invites
  are the reusable half; the metric slices are the example.

## 4. Decide what to keep

The parts worth keeping regardless of what you are building:

| Keep                        | Why                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/features/shared/auth/` | Registration, login, refresh-token rotation, password reset, email verification, organizations, memberships, invites |
| `src/shared/middleware/`    | Rate limiting, error handling, request-ID correlation, method guard                                                  |
| `src/config/`               | Zod-validated environment loading                                                                                    |
| `docs/reference/security/`  | ASVS/SSDF-mapped audit framework, gate policy, run template                                                          |
| `tests/contract/`           | Schemathesis harness                                                                                                 |
| `.github/workflows/`        | The full pipeline                                                                                                    |

The parts to replace with your own domain:

```
src/features/public/metric*/     the example domain
src/migrations/2025*-*metric*    and their tables
docs/explanation/product-requirements.md
```

## 5. Read the open findings before you ship

The script removed `docs/internal/`, which held the upstream SaaS-readiness audit — the honest
assessment of this template. To read it, re-run step 2 with `--keep-internal` on a fresh copy, or
read it in the upstream repository; its live status is
`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md`. As of 2026-10-20 it lists
**no open P0 finding**, and all six of its caveats are closed, each confirmed by an independent
grader and a reproduction. Two **P1** findings are open, both in the queue worker, and matter only
if you run it (`RABBITMQ_ENABLED=true`). Concurrent email jobs can stall for a minute on the
database connection pool, which has Sequelize's default of five connections. And a stopping worker
keeps taking messages until its channel closes. Six P2 findings are open. A production database
connection may run with TLS verification off, and `.env.example` sets
`DB_SSL_REJECT_UNAUTHORIZED=false`, so set it to `true` wherever the database has a certificate. A
database failure inside the auth middleware answers 401 rather than 5xx. A broker whose queue
declarations differ from the code's takes the API process down. `/metric-logs/stats` fails past
about 150,000 logs. And two lint rules that guard the domain layer can be stepped around. The
script generates `JWT_SECRET`, the database password and the broker login, not a Redis password
(step 3). Other open findings are P3 hardening.

The two findings that used to sit here are **closed**:

- Cache keys are scoped by `organizationId` as well as `userId`
  ([ADR-0035](../explanation/decisions/adr-0035-tenant-scoped-cache-keys.md)), and an
  architecture test fails CI if a new cache key omits the organization segment.
- Production-unsafe env switches — `DISABLE_RATE_LIMITING`, `ALLOW_TEST_HTTP_SERVER`,
  `SWAGGER_REQUIRE_AUTH=false`, `SKIP_DB_LIFECYCLE`, `LOG_LEVEL=silly`, `EMAIL_PROVIDER=mailpit`, `EMAIL_PROVIDER=console` (in staging too), and default `guest`
  RabbitMQ credentials — are refused at startup when `NODE_ENV=production`
  ([ADR-0036](../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)).

## 6. Prune the internal docs

Step 2 already did this unless you passed `--keep-internal`. If you kept it to read the audit,
remove it when you are done, and turn the links into it into plain text, as step 2 would have:

```bash
rm -rf docs/internal
node scripts/unlink-internal-docs.js
```

`node scripts/unlink-internal-docs.js --check` fails while any Markdown link still points into it.

That tree is this project's working material — doc kits, audit runs, incidents, todos. Your fork
inherits the four Diátaxis quadrants, which describe the template; it does not need Lakira's
history.

## 7. Verify

```bash
npm ci
docker compose up -d db redis rabbitmq
npm run migrate:development
npm run db:migrate:test
npm run lint && npm run typecheck && npm run docs:openapi:check && npm test
```

`npm test` does not migrate the test database itself, and one integration test needs the broker,
so both are in the list. This is the same sequence the `Fork Smoke` workflow runs on every push
(ADR-0051), gates included.

The script gave the Compose containers, network and volumes your prefix, so this runs beside the
upstream stack on the same machine without touching its database, and `docker compose down -v`
removes only your volumes. Both stacks publish the same host ports, though: stop one before you
start the other.

Green means the rebrand did not break anything. Then walk
[Getting started](./getting-started.md) against your new name.

## What you now own

A Node 24 / Express / TypeScript API with multi-tenant auth, refresh-token rotation, Zod-validated
config and requests, a generated and CI-gated OpenAPI contract, four test layers including
contract fuzzing, a security audit framework, and a deployment pipeline.

What it is not: a billing system. The upstream `docs/internal/initiatives/subscription-billing/`
kit (removed by step 2 unless you kept it) is a scaffolded plan with nothing implemented — [ADR-0025](../explanation/decisions/adr-0025-billingprovider-port-over-stripe-sdk.md)
and [ADR-0026](../explanation/decisions/adr-0026-subscription-attaches-to-organization.md) record
the intended shape, both **Proposed**.
