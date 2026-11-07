# ADR-0090 — CI is the only path that deploys staging, and migrations run only in CI

- **Status:** Accepted
- **Date:** 2026-11-07
- **Related:** issue #272, the 2026-11-07 staging outage; `audit-2026-08-17.md` (twelve-factor),
  Factor V and Factor XII, finding TF-13; [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md),
  whose release check the staging smoke test runs; [ADR-0042](./adr-0042-vps-compose-deployment-topology.md),
  which moves deployment off Render
- **Origin:** issue #272, planned and approved on 2026-11-07

---

## Context

Staging's deploys failed from at least 2026-07-30 to 2026-11-07, and the repository did not say
how staging is deployed, so the outage was fixed by hand.

- **Render's Start Command was `npm run start:staging`.** That script migrated and then started
  the server, and it put `--migrations-path src/migrations` on `node dist/server.js` instead of on
  `sequelize-cli`. The twelve-factor audit had found the defect and recommended deleting the
  script, believing nothing ran it.
- **Staging was deployed twice per push.** Render's auto-deploy fired on every push to `staging`,
  before CI had tested anything, and migrated at startup. Then `deploy_staging` ran tests, migrated
  with `migrate:staging:ci` and fired the deploy hook. Render's deploy raced CI's migration, and
  `smoke_staging`'s check that staging runs the promoted commit (`SMOKE_EXPECTED_RELEASE`) proved
  nothing about which deploy it saw.

## Decision

- **CI deploys staging, and nothing else does.** The order is tests, then `migrate:staging:ci`,
  then the deploy hook, then `smoke_staging`. Render's Auto-Deploy is off on the staging web
  service, a setting in Render's dashboard.
- **Migrations run only in CI**, as a step of their own, never in a process that starts the app
  (Factor XII). `start:staging` is `NODE_ENV=staging node dist/server.js` and is Render's Start
  Command.
  - It is kept, not deleted as the audit proposed: `start` hard-codes `NODE_ENV=production`, and
    Render needs a command for staging.
  - With no migration in it, it no longer calls `sequelize-cli`, a devDependency.
- **Two database URLs.** The web service holds Render's internal URL. The repository secret
  `STAGING_DATABASE_URL` holds the external one, since CI migrates from GitHub's runners.
- `__tests__/unit/package-scripts.test.ts` fails if a `start*` or `worker*` script runs
  `sequelize-cli`, or if a `sequelize-cli db:migrate` command lacks `--config` or
  `--migrations-path`.

## Options considered

- **Render only: auto-deploy, migrating at startup, with CI's deploy steps removed.** Staging would
  take every push before its tests pass, and the smoke job would race the rollout.
- **Keep both paths and fix the script.** Two deploys and two migration runs per push, and the
  race stays.
- **Delete `start:staging`, as the audit proposed.** Render would need `node dist/server.js` with
  `NODE_ENV` set in its dashboard, one more setting the repository cannot see.

## Consequences

- A push to `staging` deploys only when CI passes. If the hook secret is missing, `deploy_staging`
  fails loudly, and staging stays on its last good deploy.
- A migration runs before the code that needs it is deployed, so a migration must work with the
  code already running, as it must under any separate release step.
- `docs/reference/environments.md` lists the Render settings and secrets, and what to update when
  the free database expires.
