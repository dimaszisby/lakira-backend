# Database TLS and staging refusals — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `4bfaf4e` (#198).

## Acceptance criteria

- **AC-1** — Startup refuses `DB_SSL_REJECT_UNAUTHORIZED=false` when `NODE_ENV=production`, in the
  app and in the migration config. _Why:_ X1 of the dated run of 2026-10-20.
- **AC-2** — Staging verifies the database certificate unless it sets `false` explicitly, and then
  logs a warning that names the variable. _Why:_ the owner's choice (D-01); nothing silently off.
- **AC-3** — Each of `DISABLE_RATE_LIMITING`, `ALLOW_TEST_HTTP_SERVER`, `SWAGGER_REQUIRE_AUTH=false`,
  `DB_LOGGING=true`, `SKIP_DB_LIFECYCLE`, `LOG_LEVEL=silly` and a `guest` RabbitMQ login is refused
  when `NODE_ENV=staging`, with a message naming staging. _Why:_ X2.
- **AC-4** — `EMAIL_PROVIDER=mailpit` is still allowed in staging and refused in production.
  _Why:_ ADR-0048.
- **AC-5** — `.env.example` no longer ships `false`. _Why:_ X1; a fork copies it.
- **AC-6** — No refusal message quotes a value. _Why:_ envManager prints the issues unredacted.

## Phase 0 — kit and branch

- [x] `fix/database-tls-and-staging-refusals` cut with `--no-track` from `origin/dev` at
      `4bfaf4e`; HEAD and upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-03; the register's D-07

## Phase 1 — tests first, each seen to fail

- [x] `__tests__/unit/config/zodEnv.production-guard.test.ts` — production refuses
      `DB_SSL_REJECT_UNAUTHORIZED=false`; staging accepts it; the seven switches (eight cases, the
      RabbitMQ login by field and by URL) refused in staging, each message naming staging;
      `mailpit` still allowed in staging; `DB_SSL_CA` accepted as PEM, one-line `\n` read as a
      newline, a non-certificate refused without being quoted. Nine cases failed before the change
- [x] `__tests__/unit/config/zodEnv.node-env-defaults.test.ts` — staging defaults to `true`: failed
- [x] `__tests__/unit/config/db-tls-warning.test.ts` — the staging warning and `sslOptions`: failed,
      the exports did not exist
- [x] `__tests__/unit/config/config-cjs-tls.test.ts` — the migrations refuse `false` in production
      and take `DB_SSL_CA`: both failed

## Phase 2 — the fix

- [x] `src/config/zodEnv.ts` — staging's default, the production refusal, the refusal block over
      production and staging, `DB_SSL_CA` (D-01, D-02, D-04)
- [x] `src/config/db.ts` — `sslOptions` with the CA, and the staging warning
- [x] `src/config/config.cjs` — the production refusal, the CA
- [x] `.env.example` — `true`, and an empty `DB_SSL_CA`, each with a comment
- [x] `scripts/image-smoke.sh` — the Postgres mints its own CA and a certificate for its container
      name; the app is given the CA; a start without it must fail on the certificate (D-04)

## Phase 3 — gates, review, docs

- [x] Review of the diff: nothing found. A capitalised `FALSE` is refused by the schema and read as
      verification on by the migrations, so both fail safe
- [x] ADR-0036 amended (its note of 2026-10-21); D-01, D-02 and D-04 collapsed to pointers; D-03
      kept, a decision about the work
- [x] `docs/reference/configuration.md` (the row, a `DB_SSL_CA` row, the TLS note, the refusal
      paragraph), `.claude/rules/security.md`, `.claude/rules/environment.md`; `CLAUDE.md` counts
      70 env vars
- [x] The B-76 todo closed; register B-76 to Closed naming the branch; B-81 no longer lists X2
- [x] #198's loose ends: ADR-0077 Accepted (file and row); the
      `worker-cancel-and-one-connection-per-job` kit's D-01 and D-04 Accepted, README and plan
      Done; register D-06 Accepted; B-74, B-75 and their todos name `#198 (4bfaf4e)`, the Closed
      rows link their todos; "As of" `4bfaf4e`

## Discovered

- [x] Found: the image smoke ran the production image with `DB_SSL_REJECT_UNAUTHORIZED=false`
      against Postgres's self-signed certificate, which production now refuses, and the app had no
      way to trust a private CA → re-sized with the owner: `DB_SSL_CA` (D-04), a new env var, so
      ADR-0036's amendment and `configuration.md` cover it
- [x] Found: a developer's `.env`, which the loader falls back to, sets
      `DB_SSL_REJECT_UNAUTHORIZED=false`, so six existing production and staging cases tripped on
      it → in scope: the suite's clean base sets `true`, as it already neutralises the other
      ambient switches

## Acceptance

Startup cases rerun on the built server from an empty directory, every value given, the database on
a closed port so a start that passes validation stops there.

- [x] AC-1 — `zodEnv.production-guard.test.ts` › is refused as false in production;
      `config-cjs-tls.test.ts` › refuses false in production. Built server: exit 1 on
      `DB_SSL_REJECT_UNAUTHORIZED`. The image smoke runs production with verification on
- [x] AC-2 — `zodEnv.node-env-defaults.test.ts` › staging verifies by default;
      `db-tls-warning.test.ts`. Built server: staging with `false` passed validation and logged the
      warning once; staging without it logged none
- [x] AC-3 — the eight staging cases of the guard test. Built server: each of the seven switches
      refused in staging, naming it
- [x] AC-4 — › still allows `EMAIL_PROVIDER="mailpit"`; › refuses it in production. Built server:
      staging with `mailpit` passed validation
- [x] AC-5 — `.env.example` sets `true`, and an empty `DB_SSL_CA`
- [x] AC-6 — the RabbitMQ URL, `JWT_SECRET` and `DB_SSL_CA` cases assert the value is not quoted;
      no startup output held a secret or the bad CA value

## Gates

Run on Node 24.22.0 after the last change.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0; prettier run on the touched files only
- [x] tests — `test:coverage` exit 0: unit 1478 passed; integration 286 passed, 5 skipped;
      thresholds met
- [x] build — exit 0
- [x] image smoke — `docker:smoke` exit 0, seven checks; step 5 now connects with verification on
      and proves a start without the CA fails on the certificate
- [ ] OpenAPI — skipped: no route, request schema or `src/lib/openapi/**` touched
- [ ] security delta — skipped: no dependency change
