# ADR-0046 — The runtime is Node 24; CI reads the version from `.nvmrc`

- **Status:** Accepted
- **Date:** 2026-09-25
- **Related:** [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md) (floating base
  image, image not built in CI), [ADR-0042](./adr-0042-vps-compose-deployment-topology.md) (the
  image becomes the deploy artefact), [ADR-0027](./adr-0027-asynclocalstorage-for-request-correlation.md)
  (AsyncLocalStorage, whose implementation changed in Node 24)
- **Origin:** `D-01`..`D-04` in the node-24-runtime kit —
  [`node-24-runtime`](../../internal/initiatives/node-24-runtime/decisions.md)

---

## Context

Node 20 reached end of life on 2026-04-30 and no longer receives security fixes. The backend
still built, tested and shipped on it. lakira-frontend asked for both repos to move together so
local development, CI and the shared docs describe one runtime.

The version was pinned in five places: `.nvmrc`, `.node-version`, `package.json` `engines`, and a
`NODE_VERSION: 20` literal in each of `backend-ci.yml` and `commit-lint.yml`. Nothing checked that
they agreed. The Dockerfiles pinned `node:20-alpine` separately. `tsconfig.json` extended
`@tsconfig/node18`, and `@types/node` was at `^22`, so the repo described three runtimes at once.

Release lines, from `nodejs/Release` `schedule.json` as read on 2026-09-24: 22 reaches end of life
on 2027-04-30; 24 is LTS until 2028-04-30; 26 becomes LTS on 2026-10-28.

## Decision

1. **The runtime is Node 24**, in `.nvmrc`, `.node-version`, `engines.node` (`24.x`), both
   `Dockerfile` stages, `Dockerfile.dev`, `@types/node` (`^24`) and the tsconfig base
   (`@tsconfig/node24`).
2. **CI reads the version from `.nvmrc`.** Every `setup-node` step uses
   `node-version-file: .nvmrc`, and the `NODE_VERSION` literals are gone. `.node-version` stays
   while staging is on Render, which may read it; it can go with the Render config.
3. **The base image is the `node:24-alpine` tag, not a digest.** Nothing here refreshes a digest, so
   a pinned base would silently stop receiving the security fixes that motivated this change.
   Digest pinning belongs with building the image in CI (twelve-factor TF-2, ADR-0039).

## Options considered

- **Node 22.** Rejected: another move would be due in about seven months.
- **Node 26.** Rejected: not LTS until 2026-10-28, and the frontend is moving to 24.
- **Bump the `NODE_VERSION` literal instead of using `.nvmrc`.** Rejected: it leaves CI one edit
  away from drifting from local development again.
- **Pin the base image by digest now.** Rejected, for the reason in decision 3.
- **Drop the tsconfig base entirely.** Rejected: a wider change than the upgrade needs. Swapping
  it was verified to leave `dist/` byte-identical, because the local `target: esnext` wins.

## Consequences

- Verified on Node 24.21.0 before merge: typecheck, lint, format, build, unit (602) and integration
  (196, 5 skipped), OpenAPI and the security delta gate. The production image built on
  `node:24-alpine`, and `bcrypt` loaded from its musl prebuild. The image then completed a
  register, login and profile round trip against the Compose Postgres and Redis. The request id
  appeared on a log line written after the awaited database work, so ADR-0027's AsyncLocalStorage
  context survives Node 24's AsyncContextFrame implementation.
- `.nvmrc` is the single source for local development and CI. `engines`, the Dockerfiles and
  `.node-version` are still separate pins, and the next bump must touch them too.
- Node 24 bundles npm 11, which warns that install scripts are "not yet covered by allowScripts".
  It is a warning today, and `bcrypt` loads from its prebuild regardless. If a future npm makes it
  blocking, the other listed packages (`esbuild`, `@scarf/scarf`) need checking.
- Existing dev containers built from the old `Dockerfile.dev` keep running Node 20 until rebuilt.
- The next move is due before 2028-04-30.

## Links

- Kit: [`docs/internal/initiatives/node-24-runtime/`](../../internal/initiatives/node-24-runtime/README.md)
- Follow-ups filed by the kit: `docs/internal/todos/2026-09-25-todo-npm-audit-findings.md`,
  `docs/internal/todos/2026-09-25-todo-integration-parse-error-flake.md`
