# ADR-0050 — The production image defaults `NODE_ENV` to `production`

- **Status:** Accepted
- **Date:** 2026-09-28
- **Related:** Makes [ADR-0036](./adr-0036-refuse-production-unsafe-env-switches.md) (and the rows
  [ADR-0048](./adr-0048-mailpit-for-local-outbound-email.md) and
  [ADR-0049](./adr-0049-console-email-adapter-confined-to-dev-and-test.md) added) hold by default
  in the image. Precedes the [ADR-0042](./adr-0042-vps-compose-deployment-topology.md) VPS stack,
  and the image-in-CI work of [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md).
- **Origin:** `D-01`..`D-03` in the docker-image-node-env kit —
  [`docker-image-node-env`](../../internal/initiatives/docker-image-node-env/decisions.md)

> **Status note (2026-10-02).** CI now builds the image. Decision 4 says the Dockerfile test
> exists "because CI does not build the image"; since
> [ADR-0055](./adr-0055-production-image-built-and-smoked-in-ci.md) the `Image Smoke` workflow
> starts the built image with no `NODE_ENV` and checks that a production-unsafe switch is refused.
> The unit test stays as the fast guard.

---

## Context

Every startup refusal in ADR-0036, ADR-0048 and ADR-0049 is keyed on `NODE_ENV`. The production
`Dockerfile` set no `NODE_ENV`, its runtime starts with `CMD ["node", "dist/server.js"]` rather than
`npm start`, and `src/config/zodEnv.ts` defaults `NODE_ENV` to `development`. A container started
without an explicit value therefore ran as development, with every refusal off and the development
log format, which drops metadata.

Shown on 2026-09-28 with the image built from `dev` at `560f56f`: started with
`DISABLE_RATE_LIMITING=true` and no `NODE_ENV`, it passed validation and logged
`DISABLE_RATE_LIMITING=true — skipping throttling`. It would have served traffic with every rate
limiter off, auth brute-force protection included.

Nothing was exposed: Render staging sets `NODE_ENV=production` as a configured service variable
(`docs/reference/environments.md` §5). But that protection rested on each deployer remembering one
variable, and the ADR-0042 VPS stack is where images start running under this repository's own
Compose files.

## Decision

1. **The runtime stage sets `ENV NODE_ENV=production`.** Any runtime value overrides it, so staging
   sets `NODE_ENV=staging`. Forgetting to set it fails safe, under the stricter production rules.
2. **The build stage does not set it.** `npm ci` under `NODE_ENV=production` omits devDependencies,
   and the build needs `tsc`.
3. **`Dockerfile.dev` is unchanged.** It is a development image; the schema default and Compose's
   explicit `NODE_ENV: development` already agree.
4. **`__tests__/unit/dockerfile.test.ts` pins decisions 1 and 2,** because CI does not build the
   image (twelve-factor TF-2).

## Options considered

- **`CMD ["npm", "start"]`,** which sets `NODE_ENV=production` in the script. Rejected: it puts npm
  between dumb-init and node, and hides the value in a script rather than in the image metadata
  that `docker inspect` shows.
- **Refuse a defaulted `NODE_ENV` in the schema when running from `dist/`.** Rejected: it is a path
  heuristic, it is more code, and it would break `node dist/...` in local debugging.
- **Change the schema's default to `production`.** Rejected: `npm run dev`, migrations and ad hoc
  scripts on a developer's machine rely on the `development` default. The image is the artefact
  that serves traffic, so the default belongs there.

## Consequences

- With the same inputs, the image now exits 1 with the ADR-0036 refusal instead of serving
  unthrottled traffic. Verified on 2026-09-28.
- A staging container must set `NODE_ENV=staging`. If it forgets, it runs under production rules,
  for example refusing `EMAIL_PROVIDER=mailpit`. That is loud, not silent.
- The Dockerfile test checks text, not behaviour. Once TF-2 builds the image in CI, it can become a
  container check.

## Links

- Kit: [`docs/internal/initiatives/docker-image-node-env/`](../../internal/initiatives/docker-image-node-env/README.md)
- Test: `__tests__/unit/dockerfile.test.ts`
