# Getting started

Clone to a running API with data in it. About ten minutes, mostly waiting on installs.

Follow it straight through — every command is meant to be pasted as-is. Explanations of _why_
live in [`../explanation/`](../explanation/); alternatives live in [`../how-to/`](../how-to/).

## Before you start

- **Node 24** — what `.nvmrc` pins and what CI runs. Newer versions work for the steps below,
  but 24 is the only version the full pipeline is verified against.
  ```bash
  nvm use          # reads .nvmrc
  node --version   # expect v24.x
  ```
- **Docker**, for PostgreSQL and Redis.

## 1. Install

```bash
npm ci
```

## 2. Configure

```bash
cp .env.example .env
cp .env.test.example .env.test
```

`.env.test` is only needed for `npm test`; the second copy is here so the tutorial and the test
suites work from the same starting point. Both files are gitignored.

One file, `.env`, drives local development: `docker compose` reads it, the `migrate:*` scripts read
it, and `scripts/bootstrap-fork.sh` writes to it. That is not a style preference — Docker Compose's
`${VAR}` interpolation only ever reads `.env` (or the shell), never a service's `env_file`, and the
database Compose creates is built from those values. Splitting config across a second file lets the
app's credentials and the database it connects to drift apart.

The values in `.env.example` are chosen so a verbatim copy works: `DB_USER`, `DB_PASSWORD` and
`DB_NAME` are what Compose passes to Postgres as `POSTGRES_USER` / `POSTGRES_PASSWORD` /
`POSTGRES_DB`, and the `*_DATABASE_URL` entries match them.

`JWT_SECRET` is the only variable with no default. `.env.example` ships the placeholder
`replace-with-a-long-random-secret`, which boots but is not a secret. Generate a real one:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output over the `JWT_SECRET=` line in `.env`. Every other variable has a working
default — see [`../reference/configuration.md`](../reference/configuration.md).

## 3. Start PostgreSQL and Redis

```bash
docker compose up -d db redis
```

Compose reads `DB_USER`, `DB_PASSWORD`, and `DB_NAME` from `.env` to create the database, so step
2 has to come first. Wait for the healthcheck:

```bash
docker compose ps
```

`postgres_db` should read `(healthy)`.

## 4. Create the schema

```bash
npm run migrate:development
```

Twenty-seven migrations. The script is `migrate:development` — there is no `migrate:dev`.

## 5. Run it

```bash
npm run dev
```

The server starts on port 5000. In a second terminal:

```bash
curl http://localhost:5000/api/v1/health
```

```json
{
  "status": "ok",
  "environment": "development",
  "release": "...",
  "timestamp": "..."
}
```

You have a running API. The rest is using it.

---

## 6. Create an account

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "tutorial_user",
    "email": "tutorial@example.com",
    "password": "Sup3rSecret!23",
    "passwordConfirmation": "Sup3rSecret!23"
  }'
```

`passwordConfirmation` is required — omitting it returns
`{"status":"fail","errors":[{"field":"passwordConfirmation","message":"Required"}]}`.

The response carries a token **and** a user. Note the `organizationId` inside the token: registering
creates a personal organization and makes you its owner. Every row you create from here belongs to
that organization. That is the multi-tenancy model doing its job invisibly —
[`../explanation/architecture/c4-components-auth.md`](../explanation/architecture/c4-components-auth.md).

## 7. Log in and keep the token

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tutorial@example.com","password":"Sup3rSecret!23"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

echo "${#TOKEN} characters"
```

Access tokens live 15 minutes (`ACCESS_TOKEN_TTL_SEC`). If a later call returns 401, re-run this.

```bash
curl -s http://localhost:5000/api/v1/auth/profile -H "Authorization: Bearer $TOKEN"
```

## 8. Create a metric and log a value

```bash
METRIC=$(curl -s -X POST http://localhost:5000/api/v1/metrics \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name": "Morning Run", "defaultUnit": "km"}')

METRIC_ID=$(node -pe "JSON.parse(process.argv[1]).data.id" "$METRIC")
echo "$METRIC_ID"
```

```bash
curl -s -X POST http://localhost:5000/api/v1/metric-logs \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"metricId\": \"$METRIC_ID\", \"logValue\": 5.2, \"type\": \"manual\"}"
```

`type` is required and must be `manual` or `automatic` — leaving it out returns
`{"field":"body.type","message":"Invalid log type"}`.

## 9. Read it back

```bash
curl -s "http://localhost:5000/api/v1/metrics" -H "Authorization: Bearer $TOKEN"
```

The metric comes back with a `logCount`, and the list is cursor-paginated rather than offset-based.

## 10. Browse the whole API

Open <http://localhost:5000/api/v1/docs> for Swagger UI. It requires a token by default; set
`SWAGGER_REQUIRE_AUTH=false` in `.env` and restart to browse without one.

That spec is generated from the same Zod schemas that rejected your two malformed requests above —
which is why the documentation cannot drift from the validation.
[`../reference/api/`](../reference/api/).

---

## Where to go next

|                            |                                                           |
| -------------------------- | --------------------------------------------------------- |
| Build a feature            | [Your first feature slice](./your-first-feature-slice.md) |
| Make this your own project | [Fork and rebrand](./fork-and-rebrand.md)                 |
| Understand the shape       | [Architecture](../explanation/architecture/)              |
| Run the tests              | [`../how-to/testing/`](../how-to/testing/)                |

## If something went wrong

**`Missing script: "migrate:dev"`** — the script is `migrate:development`. Older docs had this
wrong.

**`ZodError: JWT_SECRET Required`** — there is no `.env` at all; step 2 was skipped. If you copied
`.env.example` but skipped generating a secret the app still boots, on the shipped placeholder —
fine for this tutorial, not for anything else.

**`env file .env not found`** — step 2 was skipped; `docker compose` reads `.env` for both the app's
environment and the database credentials it creates.

**`password authentication failed`** — your `.env` credentials no longer match the database in the
volume. Compose creates the database once, from the values present the first time it starts, so
editing `DB_USER`/`DB_PASSWORD`/`DB_NAME` afterwards requires recreating it:
`docker compose down -v && docker compose up -d`.

**`database files are incompatible with server`** — your `db_data_volume` was created by an older
Postgres. The images moved to `postgres:18` (matching production) on 2026-08-23, and Postgres will
not open a data directory written by a different major. Recreate the volumes once:

```bash
docker compose down -v && docker compose up -d
npm run migrate:development
```

This deletes local development data only.

**Postgres connection refused** — `docker compose ps` and wait for `(healthy)`.

**401 on a request that worked a minute ago** — the access token expired. Re-run step 7.
