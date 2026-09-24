# Twelve-Factor Compliance

## Overview

This kit holds the Twelve-Factor App audit for the Lakira backend — a graded, file-path-precise
assessment of how the running system scores against the [twelve-factor methodology](https://12factor.net/).

The audit is deliberately **source-first**. Every entry is graded from `src/`, the two Dockerfiles,
the three Compose files, `.github/workflows/backend-ci.yml`, and `src/config/zodEnv.ts` — not from
what the documentation claims. Several findings contradict the docs; that divergence is the point,
and where it happens the audit says so and cites both sides.

## Scope

- **In scope:** the twelve factors as they apply to the API server (`src/server.ts`) and the worker
  (`src/worker.ts`) — config loading, backing-service attachment, build/release/run separation,
  process and concurrency model, disposability, dev/prod parity, log routing, admin processes.
- **Out of scope:** application correctness, security posture (covered by
  [`../security/`](../security/)), SaaS forkability (covered by
  [`../saas-readiness/`](../saas-readiness/)), performance, and anything about the frontend.
  Where a finding overlaps another program, this audit links rather than re-grades.

Two factors were the audit's original motivation: **IV (Backing services)** and **XI (Logs)**, both
of which bear directly on the pending OTel/Prometheus/Loki/Grafana/Tempo stack decision — whether
that stack ships as an optional Compose profile or is baked into default config.

## Files in this kit

- `README.md` — this file.
- `audit-2026-08-17.md` — full audit run on 2026-08-17. Verdict, scorecard, and one entry per factor
  with evidence and recommended fixes.

Unlike the saas-readiness kit, this program has **no `decisions.md`**. All four decisions it produced
were durable architecture decisions rather than work coordination, so per
`.claude/rules/documentation.md` they went straight to the registry as
[ADR-0038](../../../explanation/decisions/adr-0038-observability-stack-as-attached-backing-service.md),
[ADR-0039](../../../explanation/decisions/adr-0039-release-identity-and-immutable-artifacts.md),
[ADR-0040](../../../explanation/decisions/adr-0040-worker-process-deployment-topology.md), and
[ADR-0041](../../../explanation/decisions/adr-0041-logs-as-event-streams-on-stdout.md).

Those four ADRs are what survives a fork — `docs/internal/` is removed by
`scripts/bootstrap-fork.sh`.

## Re-running the audit

This audit grades structure, not test results, so the usual gate commands are not the evidence base.
The evidence base is a set of scans. Each maps to specific factors:

```bash
# III — config that escapes the Zod schema
grep -rn "process\.env\." src/ --include="*.ts" | grep -v "^src/config/"

# IV / XI — is any observability backing service attached at all?
grep -rniE "@opentelemetry|prom-client|prometheus|morgan|pino-http" src/ package.json

# V — does anything stamp a release identity?
grep -rniE "GIT_SHA|COMMIT_SHA|APP_VERSION|npm_package_version|release:" src/

# VIII — is the worker wired into any deployment topology?
grep -rn "worker" docker-compose*.yml Dockerfile* .github/workflows/

# X — backing-service version drift across dev / CI
grep -nE "image: (postgres|redis|rabbitmq)" docker-compose.yml .github/workflows/backend-ci.yml

# XI — where do logs actually go?
grep -n "transports\.\|nodeEnv" src/utils/logger.ts
```

A factor cannot be ✅ if its scan contradicts the grade. When re-auditing, write the result to a new
dated file (`audit-YYYY-MM-DD.md`) in this folder — **do not overwrite the prior one**. Diff the
scorecards across runs to track progress.

## How to read the entries

Each factor entry follows the same structure:

- **Status** — ✅ (compliant) / ⚠️ (partial) / ❌ (violated).
- **What the code does** — the actual mechanism, with citations. Strengths first; several factors
  here are genuinely well built and the audit says so.
- **Gap** — what breaks the factor. 1–3 sentences, no soft pedalling. Absent when ✅.
- **Why it matters** — the operational consequence, not the doctrinal one. A factor is not worth
  fixing because 12factor.net says so.
- **Recommended fix** — opinionated, fitting the existing stack. Defers to the linked ADR where one
  exists, rather than pre-empting a decision that has not been made.
- **Effort** — S (≤ ½ day) / M (1–3 days) / L (> 3 days).
- **Evidence** — exact `file:line` with the line quoted, or an explicit "no match" for absence
  findings.

## Severity tags

Aligned with the saas-readiness kit so the two programs can be read together:

- **P0** — the factor is violated in a way that causes data loss, an outage, or an undiagnosable
  incident in production. Fix before the next production deploy.
- **P1** — the factor is violated, with real operational cost, but the system runs. Fix before
  scaling past one instance or recommending the base externally.
- **P2** — a deviation with a defensible reason, or one whose cost is only latent. Worth recording;
  not worth blocking on.

## Verdict summary

> **Dated snapshot (banner added 2026-09-24).** This summary is the 2026-08-17 grading. TF-1, TF-3
> and TF-11 have since closed, so Factor XI no longer carries a P0. The live open list is § 4 of the
> audit file.

Full reasoning is in [`audit-2026-08-17.md`](./audit-2026-08-17.md).

| Status       | Factors             |
| ------------ | ------------------- |
| ✅ Compliant | I, VI, VII, IX, XII |
| ⚠️ Partial   | II, III, IV, X      |
| ❌ Violated  | V, VIII, XI         |

The three violations share one root cause: **the deployment topology was never finished.** The
Dockerfile, the worker, and the structured logger are each individually well built and none of them
is actually wired into how the system ships. That is a more tractable problem than three independent
defects, and ADRs 0039–0041 address it as one.

## References

- [`../saas-readiness/`](../saas-readiness/) — overlapping program; its P2-5.4 (APM/metrics
  readiness) and N7 (OpenTelemetry) findings are the direct predecessors of Factor XI here.
- [`../../initiatives/observability/`](../../initiatives/observability/) — the kit that shipped
  request-ID correlation, Winston redaction, the Sentry hook, and `/api/v1/ready`. It explicitly
  scoped out Prometheus/OpenTelemetry as "P2-5.4"; this audit is where that deferral comes due.
- [`docs/explanation/architecture/c4-containers.md`](../../../explanation/architecture/c4-containers.md)
  — the container diagram, updated by this audit to stop describing the worker as deployed.
- [`docs/reference/configuration.md`](../../../reference/configuration.md) — the env var catalogue
  Factor III grades against.
