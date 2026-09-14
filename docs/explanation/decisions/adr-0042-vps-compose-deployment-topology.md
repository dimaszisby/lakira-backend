# ADR-0042 — Production and staging run as Docker Compose stacks on a self-managed VPS

- **Status:** Accepted (2026-09-15)
- **Date:** 2026-09-01
- **Related:** Changes the deployment target assumed by
  [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md) and
  [ADR-0040](./adr-0040-worker-process-deployment-topology.md), both still Proposed. Makes
  [ADR-0038](./adr-0038-observability-stack-as-attached-backing-service.md) materially cheaper.
- **Origin:** `TF-2`, `TF-3`, `TF-4` in the twelve-factor audit kit —
  [`twelve-factor`](../../internal/audits/twelve-factor/audit-2026-08-17.md)

---

## Context

The project deploys to Render's free tier for staging. Production was intended to be a
self-managed VPS, chosen for cost: this is a single-developer project based in Indonesia.

**Production does not exist yet.** `main` holds one commit ("Initial commit") while `dev` is 466
ahead, and `deploy_production` has never run. So this decision is being taken before the first
promotion rather than after, which is the cheap moment to take it.

Three facts make the current plan untenable as written.

**The split target destroys parity.** Staging on a managed platform and production on a VPS means
staging cannot represent production: different runtime, different process model, different managed
services. Factor X — dev/prod parity — is the thing the twelve-factor audit grades, and the plan
violates it by construction. A green staging deploy would tell us the app works _on Render_, which
is not the question being asked.

**The free tier has already destroyed data.** Staging's Postgres was deleted on 2026-08-22 and came
back empty. That is the free tier behaving as designed, not an incident. Any environment whose data
matters cannot live there.

**The application's shape fights Render's model.** The app needs four things to run:

| Requirement                                 | On Render                      | On a VPS with Compose   |
| ------------------------------------------- | ------------------------------ | ----------------------- |
| Postgres                                    | paid add-on; free tier expires | container, named volume |
| Redis — `REDIS_REQUIRED=true`, not optional | paid add-on                    | container               |
| RabbitMQ                                    | not offered natively           | container               |
| `src/worker.ts`                             | separate paid service          | one Compose service     |

`src/worker.ts` has three npm scripts (`worker`, `worker:dev`, `worker:staging`) and **zero
deployment targets** — no Compose service, no CI job, no Render service. That is TF-4, and it has
gone unfixed because there was no affordable place to put it.

Meanwhile a production-grade `Dockerfile` already exists — multi-stage, `dumb-init`, `USER node`, no
devDependencies — and **CI has never built it**: the workflow contains zero docker references. Both
deploy jobs run `npm run build`, discard the output, and `curl` a Render hook that rebuilds from
source. That is TF-2, and it is why release identity (TF-3) has no natural home.

## Decision

**Production and staging both run as Docker Compose stacks on a self-managed VPS. Render is retired
from the promotion path.**

1. **One VPS, Singapore region.** Latency from Indonesia is ~10–30ms to Singapore against ~180ms to
   European hosts, so the cheapest providers are not the right ones here. Both environments run as
   separate Compose projects on one machine initially — distinct ports, volumes, and databases —
   splitting onto a second host when isolation is worth more than the saving.

2. **CI builds the image once and deploys that artefact.** Build on tag/push, label it with the
   commit SHA, push to a container registry, and deploy by pulling that exact tag. Nothing rebuilds
   from source at the destination. This is what makes ADR-0039 implementable rather than aspirational:
   the SHA is known at build time and can be baked into the image and surfaced at runtime.

3. **The worker becomes a first-class Compose service**, resolving TF-4 and giving ADR-0040 a
   concrete target.

4. **A reverse proxy terminates TLS** with automatic certificate issuance (Caddy or Traefik). TLS
   renewal must not be a manual task.

5. **Backups are automated and rehearsed.** Scheduled `pg_dump` to off-host object storage, plus a
   **scheduled restore drill**. This is not optional and not a later phase: a database has already
   been lost once on this project, and an untested backup is not a backup.

6. **The observability stack (ADR-0038) co-locates** on the same host when it lands, as Compose
   services rather than paid add-ons.

Render may still be used for throwaway preview environments, where its ergonomics are genuinely
good. It must not gate promotion, because it cannot represent the production it would be gating.

## Options considered

- **Render for production as well.** Rejected on cost and fit rather than quality. Every service in
  the topology is a separate paid add-on, RabbitMQ is not offered at all, and the worker needs its
  own service. For a single-developer project the monthly cost exceeds a VPS by a wide margin while
  delivering an architecture the app does not fit.

- **Render staging + VPS production — the original plan.** Rejected. Beyond the parity argument,
  staging on Render _cannot exercise the application_: no RabbitMQ means the queue path is untested,
  and no worker service means `src/worker.ts` is never run. A staging environment that cannot run
  half the system is not staging.

- **Managed Kubernetes, Fly.io, or Railway.** Rejected as disproportionate. Each solves problems of
  scale and team coordination this project does not have, at a complexity or cost premium that a
  single developer pays without recovering.

- **Two VPS hosts from the outset.** Deferred rather than rejected. It is the right end state, and
  the Compose stacks are portable by construction, so the migration is a copy. Not worth the extra
  monthly cost before there is revenue or a second person.

## Consequences

- **Parity is restored.** Staging becomes the same runtime, process model, and backing services as
  production, which is what makes a staging gate meaningful.

- **Several open findings become tractable rather than awkward.** TF-2 and TF-3 (build once, deploy
  that artefact, carry a release identity), TF-4 (the worker gets a home), TF-5 / ADR-0038
  (observability as co-located containers). The production post-deploy smoke gate also becomes
  _verifiable_, because there is a production to verify against.

- **The existing `Dockerfile` finally gets used.** It was written for this and has been dead weight.

- **Operational burden moves to us.** OS patching, TLS, uptime, and backups are no longer someone
  else's problem. TLS and patching automate well; backups require the discipline of restore drills.

- **Single point of failure.** No managed failover. For a solo project pre-revenue this is an
  acceptable trade, but it is a trade and not a free win.

- **Shared blast radius while both stacks share a host.** A resource exhaustion or a bad `docker
compose down -v` can take both environments. Mitigated by separate Compose projects and volumes,
  removed entirely by the eventual split.

- **ADR-0039 and ADR-0040 should be revised before implementation.** Both are Proposed and both
  assume Render. Writing them against this target avoids writing them twice.

## Open questions, resolved on acceptance (2026-09-15)

Both were recorded as able to reverse this decision. Both were answered in favour of it:

- **Traffic and uptime expectations.** Confirmed hobby-scale for now, moving toward paying
  customers. The assumption the decision was written under holds.
- **Appetite for being on call.** Confirmed: the cost saving is worth the operational ownership.

Neither is permanent. If the project acquires paying customers with uptime commitments, the honest
re-read is a second host and a managed database — the Compose stacks are portable by construction,
so that migration is a copy rather than a rewrite.

## What acceptance unblocks

Four findings in the twelve-factor audit were parked on this decision and now have a concrete
target:

| Finding | Was blocked because                                  | Now                                            |
| ------- | ---------------------------------------------------- | ---------------------------------------------- |
| TF-2    | no artefact destination — Render rebuilt from source | build once, push to a registry, deploy the tag |
| TF-3    | release identity had nowhere to live without TF-2    | bake the SHA into the image                    |
| TF-4    | `src/worker.ts` had no deployment target             | a first-class Compose service                  |
| TF-5    | observability meant paid add-ons                     | co-located containers                          |

**TF-4's local and CI halves were never actually blocked by this** and should not wait for the VPS
to exist. `src/worker.ts` has never run in any environment: `RABBITMQ_ENABLED` defaults to `false`
(`zodEnv.ts:228`), `.env.example` sets it to `false`, and the worker exits immediately when it is
(`worker.ts:16-21`). Giving it a Compose service and a CI job is independent of where production
lands, and is the prerequisite for trusting it once production exists.

**ADR-0039 and ADR-0040 should be rewritten against this target before implementation.** Both are
still Proposed and both assume Render.

## Links

- [ADR-0038](./adr-0038-observability-stack-as-attached-backing-service.md) — becomes cheaper here
- [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md) — becomes implementable here
- [ADR-0040](./adr-0040-worker-process-deployment-topology.md) — gets a concrete target here
- [`audit-2026-08-17.md`](../../internal/audits/twelve-factor/audit-2026-08-17.md) — TF-2, TF-3, TF-4
- [`environments.md`](../../reference/environments.md) — records production as `TBD`; supersede when this lands
