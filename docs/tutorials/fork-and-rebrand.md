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

The name must match `^[a-z][a-z0-9-]*$` — lowercase, digits, hyphens, starting with a letter. The
script rejects anything else, deliberately: the name is interpolated into `sed` patterns, and a
`/` or `|` would break them.

It is idempotent, so running it twice with the same name changes nothing.

What it does:

|                                  |                                                                             |
| -------------------------------- | --------------------------------------------------------------------------- |
| `lakira-backend` → `my-app`      | `package.json`, `package-lock.json`, `.env.example`, CI workflows           |
| `lakira` → `my-app` (short name) | queue topology, database names, CI database references                      |
| Rotates `JWT_SECRET`             | in `.env`, created from `.env.example` if absent                            |
| Sets `APP_NAME=my-app`           | in `.env`                                                                   |
| Creates `.env.test`              | from `.env.test.example`, so `npm test` runs out of the box                 |
| Removes `docs/internal/`         | the upstream project's working material — pass `--keep-internal` to keep it |
| Writes `FORKED-FROM.md`          | recording `git rev-parse HEAD` (see step 1)                                 |

The script's short name is the full name minus a trailing `-backend` or `-api`, so
`my-app-backend` becomes `my-app`, and it is used for queue and database names. At runtime,
`src/config/app-name.ts` derives its own short and display names from `APP_NAME`, and strips only
`-backend`: a name ending in `-api` keeps the suffix there (`my-app-api` → `My App Api`). Prefer a
`-backend` name if the two should agree.

## 3. Check what it could not reach

The script covers file contents. These are yours:

- **`.env` and `.env.test` are the only env files it writes.** Set `APP_NAME` and a fresh
  `JWT_SECRET` in every deployed environment (staging, production) yourself.
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
`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md`. As of 2026-09-24 it lists
**no open P0 or HIGH findings**, and all six of its C1–C6 caveats are closed. Remaining open
findings are P1/P2 hardening (for example request-id propagation across RabbitMQ, and an unbounded
date range on `/metric-logs/stats`).

The two findings that used to sit here are **closed**:

- Cache keys are scoped by `organizationId` as well as `userId`
  ([ADR-0035](../explanation/decisions/adr-0035-tenant-scoped-cache-keys.md)), and an
  architecture test fails CI if a new cache key omits the organization segment.
- Production-unsafe env switches — `DISABLE_RATE_LIMITING`, `ALLOW_TEST_HTTP_SERVER`,
  `SWAGGER_REQUIRE_AUTH=false`, `SKIP_DB_LIFECYCLE`, `LOG_LEVEL=silly`, and default `guest`
  RabbitMQ credentials — are refused at startup when `NODE_ENV=production`
  ([ADR-0036](../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)).

## 6. Prune the internal docs

Step 2 already did this unless you passed `--keep-internal`. If you kept it to read the audit,
remove it when you are done:

```bash
rm -rf docs/internal
```

That tree is this project's working material — doc kits, audit runs, incidents, todos. Your fork
inherits the four Diátaxis quadrants, which describe the template; it does not need Lakira's
history.

## 7. Verify

```bash
npm ci
docker compose up -d db redis
npm run migrate:development
npm run lint && npm run typecheck && npm test
```

Green means the rebrand did not break anything. Then walk
[Getting started](./getting-started.md) against your new name.

## What you now own

A Node 20 / Express / TypeScript API with multi-tenant auth, refresh-token rotation, Zod-validated
config and requests, a generated and CI-gated OpenAPI contract, four test layers including
contract fuzzing, a security audit framework, and a deployment pipeline.

What it is not: a billing system. The upstream `docs/internal/initiatives/subscription-billing/`
kit (removed by step 2 unless you kept it) is a scaffolded plan with nothing implemented — [ADR-0025](../explanation/decisions/adr-0025-billingprovider-port-over-stripe-sdk.md)
and [ADR-0026](../explanation/decisions/adr-0026-subscription-attaches-to-organization.md) record
the intended shape, both **Proposed**.
