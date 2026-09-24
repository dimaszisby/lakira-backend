# ADR-0039 — Every deploy carries a release identity; the built artefact is what ships

- **Status:** Proposed — Part 1 (release identity) implemented 2026-09-16 on
  `feat/release-identity`; Part 2 (immutable build artefact) is written against Render, which
  [ADR-0042](./adr-0042-vps-compose-deployment-topology.md) retires, and awaits a rewrite as its
  own ADR before it can be adopted.
- **Date:** 2026-08-17
- **Related:** Pairs with [ADR-0040](./adr-0040-worker-process-deployment-topology.md) — both concern
  what a Lakira release consists of and what runs it. Part 2 is written against Render, which
  [ADR-0042](./adr-0042-vps-compose-deployment-topology.md) retires; see this record's Status.
- **Origin:** `TF-2`, `TF-3` in the twelve-factor audit kit — [`twelve-factor`](../../internal/audits/twelve-factor/audit-2026-08-17.md)

---

## Context

The repository contains a production `Dockerfile` that is genuinely well built — multi-stage, `tsc`
confined to the build stage, runtime carrying only `dist/` and production dependencies, `USER node`,
`dumb-init` as PID 1, no config baked in.

Nothing builds it. The `deploy_staging` and `deploy_production` jobs run `npm run build` on the
GitHub Actions runner (`.github/workflows/backend-ci.yml:387`, `:485`), discard the output, run
migrations, and finish by triggering a Render deploy hook (`:398`, `:496`). Render then performs its
own build from source. There is no `docker build` and no registry push anywhere in the workflow.

So the artefact CI validated is never the artefact that serves traffic. Two independent builds of
the same commit are, at best, coincidentally identical — they differ in base image resolution
(`node:20-alpine` floats), in transitive dependency resolution timing, and in build environment.

Separately, and independently damaging: **no release identity exists anywhere in the system.**
`grep -rniE "GIT_SHA|COMMIT_SHA|APP_VERSION|npm_package_version|release:"` across `src/` returns
nothing. `package.json:3` carries a static `"version": "1.0.0"` that no runtime code reads, and
`Sentry.init` (`src/server.ts:56-62`) sets `dsn`, `tracesSampleRate`, and `environment` but no
`release` — so no captured error can be attributed to a build.

These two problems have very different costs to fix, and conflating them has kept both unfixed. The
first is a topology change with real trade-offs. The second is roughly ten lines.

## Decision

**Split the two, and do not let the harder one block the easier one.**

### Part 1 — Release identity, unconditional

Every running process must be able to say which commit it is. This is adopted independently of Part
2 and regardless of how the build topology evolves:

1. `APP_RELEASE` joins `src/config/zodEnv.ts` as an optional string, defaulting to `"unknown"`.
2. CI passes the commit SHA into the deploy environment; the Render service exposes it via its own
   `RENDER_GIT_COMMIT` where available, with `APP_RELEASE` taking precedence when both are set.
3. `GET /api/v1/health` includes `release` in its response body, next to the existing `environment`
   and `timestamp`. This is the cheapest possible answer to "what is running right now."
4. `Sentry.init` sets `release: env.APP_RELEASE`.
5. The logger's `defaultMeta` gains `release`, so every log line carries it — which is only useful
   once [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md) lands.

### Part 2 — The built artefact is the deployed artefact

CI builds the production image once, publishes it to a registry tagged with the commit SHA, and the
deploy step instructs Render to run **that image** rather than rebuilding from source. Render's
Docker deploy path supports this; the deploy hook is replaced by an image reference.

The build/release/run separation this creates:

| Stage       | What it is                                                    | When                               |
| ----------- | ------------------------------------------------------------- | ---------------------------------- |
| **Build**   | `docker build` → image tagged `<sha>`, pushed to the registry | once, on the `tests` job's success |
| **Release** | that image + the environment's config, identified by `<sha>`  | per environment                    |
| **Run**     | Render runs the released image; no build occurs               | per instance                       |

Migrations remain a discrete step before the deploy trigger, unchanged — that part is already
correct and [ADR-0040](./adr-0040-worker-process-deployment-topology.md) depends on it staying so.

**Part 1 is not conditional on Part 2.** If Part 2 is deferred or rejected on cost grounds, Part 1
still lands and still answers the attribution question.

## Options considered

- _Keep Render's source build; add release stamping only (Part 1 alone)._ Seriously considered, and
  it is the correct fallback. It fixes attribution — the most acute symptom — for near-zero cost and
  no operational change. Not adopted as the whole answer because it leaves rollback unsolved: you
  can identify the bad release but cannot redeploy a known-good artefact, only rebuild an older
  commit and hope the build is equivalent.
- _Build the image in CI, push to a registry, deploy by digest rather than tag._ Considered.
  Digest-pinning is strictly more correct than SHA tags, since tags are mutable. Deferred rather
  than rejected: it complicates the rollback ergonomics (a digest is not human-readable) and the SHA
  tag is already a large improvement over the status quo. Revisit if a tag is ever overwritten.
- _Move off Render to a platform with first-class image deploys._ Rejected as out of scope. The
  problem is solvable within Render, and a hosting migration is a much larger decision that should
  not be smuggled in through an audit finding.
- _Use `npm version` / `package.json` as the release identity._ Rejected. It requires a commit to
  bump, drifts silently from what is deployed, and is already stale at `1.0.0`. The commit SHA is
  free, unambiguous, and always correct.
- _Have the app read its own git SHA at runtime._ Rejected. `.git` is not present in the runtime
  image (correctly — `.dockerignore` excludes it), and shelling out to `git` from a running service
  would be a new implicit system dependency of exactly the kind Factor II warns about.

## Consequences

- **From Part 1:** `/api/v1/health` gains a field. Anything asserting on its exact response shape
  needs updating — ~~the contract tests under `tests/contract/` and the generated OpenAPI spec,
  which is CI-drift-gated, so `npm run docs:openapi:generate` must run in the same change~~.
  **Correction (2026-09-16):** `/api/v1/health` is not in the OpenAPI spec, so no regeneration is
  triggered. The Newman contract tests referenced here were retired in PR #75; what remains is
  Schemathesis, spec-driven, and it never touches `/health`. Actual blast radius is near zero.
- Sentry issues become attributable to a commit, and Sentry's release-tracking features (regression
  detection, suspect commits) start working. This is the single largest practical gain and it comes
  from Part 1.
- **From Part 2:** CI gains a `docker build` + push step, adding several minutes and a registry
  credential to the pipeline. Registry storage costs accrue and need a retention policy — untagged
  images older than 30 days is a reasonable default.
- Rollback becomes redeploying a prior tag rather than reverting a commit and waiting for a rebuild.
  This is the difference between a one-minute and a ten-minute recovery, and it removes the
  possibility of a rollback build differing from the build being rolled back to.
- The `Dockerfile` finally gets exercised by CI on every deploy, so it stops being able to rot
  silently. It is currently built only by `scripts/test-ci.sh` and `docker-compose.test.yml`. _(2026-09-24: both were retired; `npm run docker:build` is now the only way to build it until this decision lands — see the `retire-test-ci` kit.)_
- Node base image resolution stops floating between the CI build and the Render build, because there
  is only one build.
- **Not addressed here:** the four unused npm scripts (`staging`, `prod`, `start:staging`,
  `worker:staging`) that reference devDependencies and would fail inside the runtime image. That is
  `TF-13`, a straightforward deletion, and needs no decision record.

## Links

- [`audit-2026-08-17.md`](../../internal/audits/twelve-factor/audit-2026-08-17.md) § Factor V
  (TF-2, TF-3)
- [ADR-0040](./adr-0040-worker-process-deployment-topology.md) — the other half of "what ships and
  what runs it"
- [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md) — `release` in log metadata is only
  useful once logs reach a collector
- `.github/workflows/backend-ci.yml:485-496` — build, discard, migrate, `curl` the deploy hook
- `Dockerfile` — the artefact this ADR puts into service
- `src/server.ts:56-62` — `Sentry.init` without `release`
- `src/server.ts:143-149` — the `/api/v1/health` handler gaining the field
