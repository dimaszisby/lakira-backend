# ADR-0055 — CI builds the production image and smoke-tests it in production mode

- **Status:** Accepted
- **Date:** 2026-10-02
- **Related:** audit finding R6 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6);
  proves [ADR-0050](./adr-0050-production-image-defaults-node-env.md) at run time; precedes the
  [ADR-0042](./adr-0042-vps-compose-deployment-topology.md) VPS stack and Part 2 of
  [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md); follows the shape of
  [ADR-0051](./adr-0051-fork-proven-in-ci.md)
- **Origin:** `D-01` and `D-02` in the build-image-in-ci kit —
  [`build-image-in-ci`](../../internal/initiatives/build-image-in-ci/decisions.md)

---

## Context

Nothing in CI built the production `Dockerfile`. The test jobs run the npm scripts on the runner,
and staging deploys through a Render hook that rebuilds from source. The image was only ever built
by hand.

That hid a real break: from `bba4e6c` until `cb99f50` the runtime stage could not install its
dependencies (`npm ci --omit=dev` ran the `prepare` script, which needs a devDependency), and
nobody noticed. It also meant ADR-0050 — the image defaults `NODE_ENV` to `production`, so every
startup refusal holds — could be pinned only by a unit test that reads the Dockerfile's text.

ADR-0042 makes this image the deploy artefact. It has to be proven before that work starts.

## Decision

1. **`scripts/image-smoke.sh` (`npm run docker:smoke`) builds the production image and checks, by
   running it:**
   1. it builds;
   2. it runs as a non-root user;
   3. it has `dist/server.js`, no devDependencies, and `bcrypt`'s native binary loads;
   4. started with no `NODE_ENV` and `DISABLE_RATE_LIMITING=true`, it exits with the ADR-0036
      refusal — so the image's default really is production;
   5. in production mode it serves `/api/v1/health` (reporting `production` and the `APP_RELEASE`
      it was given) and `/api/v1/ready` (database and Redis both `ok`), and answers plain HTTP
      with the 301 redirect;
   6. `docker stop` ends it with exit code 0.
2. **A workflow, `Image Smoke` (`.github/workflows/image-smoke.yml`), runs it** on the same
   triggers as `Fork Smoke`: every push to the working branches and every pull request.
3. **The smoke brings its own Postgres and Redis** as throwaway containers on a private Docker
   network. Postgres runs with TLS, because production mode connects over TLS
   (`src/config/db.ts`); it uses the self-signed certificate the official image ships. Only the
   app is published, on a random localhost port, and an exit trap removes everything. The same
   command behaves the same on a laptop and on the runner, and needs no `.env`.

## Options considered

- **A job inside `backend-ci.yml`.** Rejected: it depends on none of the test jobs, and a separate
  workflow follows ADR-0051.
- **Build only.** Rejected: the `cb99f50` break was at build time, but the `NODE_ENV` default, the
  TLS connection and the shutdown path only show when the container runs.
- **The Compose `db` and `redis` services, or Actions service containers.** Rejected: Compose needs
  a `.env`, binds host ports 5432 and 6379 and has no TLS; service containers would make the CI run
  differ from the local one.
- **Serve under `NODE_ENV=development`.** Rejected: it would not exercise the code path the image
  exists for.
- **Reuse `tests/smoke/run-smoke.mjs`.** Rejected: it cannot send the `X-Forwarded-Proto` header
  that production mode's HTTPS redirect requires, and it would add `npm ci` to a job that otherwise
  needs only Docker.

## Consequences

- **One image build per push**, about two minutes, in parallel with the other workflows.
- **It does not gate a deploy by itself.** As its own workflow it blocks `deploy_staging` only if
  branch protection makes it a required check. That is not decided here, and neither is it for
  `Fork Smoke`.
- **The image is built and thrown away.** Building once and shipping that artefact is still Part 2
  of ADR-0039, and deploying it is ADR-0042.
- **Check 4 matches the refusal's wording.** Rewording that message in `src/config/zodEnv.ts`
  fails the smoke with "not the ADR-0036 refusal" until the script is updated.
- **The Postgres and Redis image tags are repeated** in the script; an upgrade has one more place
  to change (`docker-compose.yml`, `backend-ci.yml`, `scripts/image-smoke.sh`).
- **It pulls from Docker Hub unauthenticated**, like the service containers in `backend-ci.yml`. A
  rate-limited pull fails the run with a FAIL line naming the script line; a rerun clears it.
- **`__tests__/unit/dockerfile.test.ts` stays**: it fails in seconds without Docker, where the
  smoke takes minutes.
- **The worker is not covered.** It has no image of its own yet (ADR-0040 is Proposed).

## Links

- Kit: `docs/internal/initiatives/build-image-in-ci/`
- Script: `scripts/image-smoke.sh`
- Workflow: `.github/workflows/image-smoke.yml`
