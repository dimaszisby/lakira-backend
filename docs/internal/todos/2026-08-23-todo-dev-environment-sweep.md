# Todo — dev-environment sweep (TF-8, TF-9, CI triggers)

- **Status:** Complete — delivered by #66 (`b6d12bd`)
- **Created:** 2026-08-23
- **Completed:** 2026-08-23
- **Owner:** dimaszisby
- **Branch:** `chore/dev-environment-sweep` (off `dev` @ `47854e2`)

Closes **TF-8** and **TF-9** from the twelve-factor audit, plus **C1 · Forkability** from
`SAAS-BASE-CHECKLIST.md`, and widens the CI push trigger. Four further defects surfaced during
implementation, three of them only by running the documented steps rather than reading them. Also
retro-closes **TF-1** and **TF-11** in the audit table, which the previous PR resolved without
updating the tracker.

---

## What was wrong

### TF-9 — `docker compose up` failed on a fresh clone

`docker-compose.yml:87` hard-required `env_file: .env.development`, gitignored and absent:

```
env file /Users/…/lakira-backend/.env.development not found
```

The first attempt standardised on `.env.development`, reasoning that Compose, the `migrate:*`
scripts and `bootstrap-fork.sh` all named it. **That was wrong and it broke `migrate:development`**
— caught only by running it. Two reasons:

1. **Compose's `${VAR}` interpolation reads only `.env` or the shell, never a service's `env_file`.**
   The db service's `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` come from `${DB_USER}` etc., so
   they resolve from `.env`. On a fresh clone with no `.env` they interpolate to empty. Local dev
   fundamentally requires `.env`; a second file cannot replace it.
2. **`.env.example`'s credentials contradicted every other source** — `postgres`/`lakira_development`
   against `lakira_user`/`lakira_test_db` in `.env`, `.env.test` and the init script's GRANTs. So
   `cp .env.example .env.development` produced an app configured for a role that does not exist.

Standardised on **`.env`**, which is what `README.md` and `getting-started.md` already said. Three
things force it: Compose interpolation, above; Twelve-Factor III, which warns against grouping config
into named environments — this repo's own audit tracks that as TF-7, and `.env.development` deepens
it; and the repo's own naming, where `.env.test.example` → `.env.test` implies `.env.example` →
`.env`.

Changed: `docker-compose.yml` `env_file`, six `migrate:*` scripts, `scripts/bootstrap-fork.sh`, and
the README / getting-started wording.

### The database was never actually created

Three more defects, all surfaced by a real fresh-clone run:

**`docker/db/init/01-create-dbs.sql` used `CREATE DATABASE IF NOT EXISTS`** — syntax PostgreSQL has
never supported (it is MySQL's). Verified against the live server: `ERROR: syntax error at or near
"NOT"`. Both statements had always errored, so `lakira_test_db` was never created by that script.
Rewritten as a plain `CREATE DATABASE`: an init script only ever runs against an empty cluster, so
the guard was never needed. The hardcoded `GRANT ... TO lakira_user` is dropped too — the script runs
as `POSTGRES_USER`, who therefore owns the database, so it now survives a change to `DB_USER`.

**`.env.example`'s `*_DATABASE_URL` entries silently overrode the `DB_*` vars.**
`normalizeDatabaseConfig` (`zodEnv.ts:448-460`) prefers them, and they carried both the wrong user
and — for the test URL — the wrong database name, `lakira_test` where the database is
`lakira_test_db`. Aligned with the `DB_*` values.

**The app container could not reach its backing services.** `.env` holds host-facing values
(`127.0.0.1`) for commands run on the developer's machine, but inside the Compose network Postgres
and Redis are at `db` and `redis`. The app service's `environment:` block now overrides `DB_HOST`,
`DEVELOPMENT_DATABASE_URL`, `REDIS_HOST` and `RABBITMQ_URL` — `environment:` beats `env_file:`, which
is what makes one shared `.env` workable.

Together these close **C1 · Forkability (P1)**: `bootstrap-fork.sh` now targets `.env` and creates it
from `.env.example` when absent, so its `JWT_SECRET` rotation and `APP_NAME` rewrite actually run
instead of silently no-opping on a fresh clone.

### TF-8 — three Postgres majors, CI furthest from production

| Environment               | Before               | After         |
| ------------------------- | -------------------- | ------------- |
| Production (Render)       | **18**               | 18            |
| Dev Compose               | `postgres:17-alpine` | `postgres:18` |
| `docker-compose.test.yml` | inherited 17         | inherits 18   |
| GitHub Actions            | `postgres:15`        | `postgres:18` |

The gate deciding whether a change merges ran **two majors behind production**. `redis` floated on
`redis:alpine` in dev against a pinned `redis:7` in CI; both are now `redis:7-alpine`.

### The alpine question — and why it mattered more than expected

The first draft of this plan bumped Compose to `postgres:18-alpine` and CI to `postgres:18`,
preserving each file's existing variant without justifying it. That was challenged during review,
and it was wrong.

Alpine is musl; Render's managed Postgres is glibc. Postgres takes text collation from the OS
locale, so the two order text differently. Measured directly against both images:

```text
musl  (postgres:17-alpine) : Apricot, Banana, apple, banana, cherry   <- codepoint order
glibc (postgres:18)        : apple, Apricot, banana, Banana, cherry   <- dictionary order
```

Not a subtle difference — a completely different ordering. `metric/infrastructure/http/schema.zod.ts:107-117`
accepts `sort=name` and `-name` on a text column, there is no explicit `COLLATE` anywhere in
`src/migrations/` or `docker/db/init/`, and cursor pagination keys on that ordering. Pinning
dev/test to alpine and CI to non-alpine would have returned different pages in CI than in
production, and let cursor pages skip or repeat rows at boundaries — swapping one drift for another
while claiming to close TF-8.

Postgres is therefore **non-alpine in both files**. Redis keeps `-alpine`: no collation semantics,
so the variant is a pure size choice and only the pin consistency matters.

### Fourth defect — the Compose port mapping could not work

`docker-compose.yml:98` mapped `"8001:8001"`, but the app listens on `PORT`, which defaults to
`5000` (`zodEnv.ts:28`) and is `5000` in `.env.example:16`. Nothing listened on container port 8001,
so even after the env-file fix the mapped port would have refused connections.

Now `"8001:5000"`, with `PORT: 5000` set explicitly in the service's `environment:` block so it
holds regardless of the developer's env file (`environment:` overrides `env_file:`). Host 8001 is
kept deliberately — host 5000 collides with AirPlay Receiver on macOS.

### CI trigger gap

`backend-ci.yml` triggered pushes on `main`, `dev`, `staging`, `feature/**` only. Every branch this
session — `docs/newman-tech-debt`, `fix/tenant-scoped-cache-keys`, `fix/logs-to-stdout` — got no CI
until a PR opened. Added `fix/**`, `chore/**`, `docs/**`, `refactor/**`.

The `pull_request` trigger was always the real gate, so nothing merged untested; what was missing
was early signal. `concurrency: backend-ci-${{ github.ref }}` with `cancel-in-progress: true`
already cancels superseded pushes. This does add runner minutes — a branch with an open PR runs both
workflows, which was already true for `feature/**`.

---

## Verification

The suites were not the interesting part here; the environment was. Every row below was run against
a genuine fresh-clone state (`.env` and `.env.development` both deleted, volumes destroyed).

| Check                                            | Result                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Fresh clone, no `.env` → `docker compose config` | reproduced the missing-env-file failure                                       |
| `cp .env.example .env` → `docker compose up -d`  | **all four services healthy**                                                 |
| `npm run migrate:development`                    | clean                                                                         |
| `GET /api/v1/health` on the mapped port          | **200**                                                                       |
| `GET /api/v1/ready`                              | `{"status":"ok","checks":{"db":"ok","redis":"ok"}}`                           |
| Databases created                                | `lakira_development` **and** `lakira_test_db` — the latter for the first time |
| Postgres version / collation                     | 18.6 (Debian), `en_US.utf8` (glibc)                                           |
| Collation difference, musl vs glibc              | measured against both images — see above                                      |
| `npm run db:migrate:test` + integration          | **172 passed, 26 suites**                                                     |
| lint / typecheck / format:check                  | 0                                                                             |
| `docs:openapi:check`                             | 0, no drift                                                                   |
| `test:unit`                                      | 531 passed, 86 suites                                                         |
| `security:delta:gate`                            | passed=true, blocking=0, 2 medium                                             |

The end-to-end walkthrough is the result that matters: `cp .env.example .env` →
`docker compose up -d` → `npm run migrate:development` → a served request returning 200. That path
has never worked in this repo before.

Two lessons worth keeping. The PG18 mount defect was originally "verified" with a bare
`docker run postgres:18` and **no volume mount** — the one dimension that breaks — so the check
passed and proved nothing. And the `.env` direction was only exposed as wrong by running the
migration, not by reading the files. Both were caught by actually executing the documented steps.

`bash scripts/test-ci.sh` was not run separately; it builds the same images through Compose, which
the walkthrough above exercises directly.

## Developer action required on pull

`db_data_volume` was written by Postgres 17 and **Postgres 18 will refuse to open it**
(`database files are incompatible with server`). Once, after pulling:

```bash
docker compose down -v && docker compose up -d
npm run migrate:development
```

This deletes local development data only. Documented in the getting-started troubleshooting section,
since undocumented it reads as "the upgrade broke everything".

## Not done

- **TF-10** (RabbitMQ absent from CI) and **TF-7** (config grouped by named environments) — adjacent
  rows in the same audit, but M-effort and unrelated to getting a clone running.
- **`Dockerfile.dev:1-2`** still claims `docker-compose.test.yml` uses it; that file actually builds
  the production `Dockerfile`. Stale comment, left alone.
- **Render's own Postgres version** is now recorded in `docs/reference/environments.md` on the
  user's word. If Render auto-upgrades the managed instance, that note and the pins are what need
  revisiting together.
