# ADR-0013 — Three-bucket audience taxonomy: `public/`, `admin/`, `shared/`

- **Status:** Accepted
- **Date:** 2026-05-01
- **Origin:** `ADR-001` in the Feature audience restructure kit — [`feature-audience-restructure`](../../internal/initiatives/feature-audience-restructure/decisions.md)
- **Note:** originally logged as _Proposed_.
- **Note:** date backfilled from git history; the kit left it as `YYYY-MM-DD`.

---

## Context

`src/features/` is flat. SaaS plans demand a visible boundary between end-user surfaces and internal/ops surfaces. We need a taxonomy that's small enough to be obvious and large enough to fit reality.

## Decision

Three buckets:

- `public/` — slices a normal end user authenticates against.
- `admin/` — slices guarded by `requireAdmin` (role-based).
- `shared/` — slices intentionally serving both audiences (today: `auth`).

## Options considered

1. **Two buckets (`public/`, `admin/`)** — forces `auth` into one or the other; misleading because login serves both audiences and the User entity is a single shared aggregate.
2. **Three buckets (chosen)** — `shared/` carries the genuinely cross-audience pieces and prevents wrong "ownership" labeling.
3. **Per-tenant buckets / multi-tenant first** — premature; we have no tenant abstraction today. Revisit in a separate initiative.

## Consequences

- `auth` lives under `shared/auth`. Future cross-audience slices (e.g., feature flags, audit log writer) also go to `shared/`.
- The `admin/` bucket starts empty — that's intentional foundation work, not bikeshedding. First admin feature lands there.
- `shared/` is a controlled space: a slice belongs there only when both audiences legitimately consume it. Default to picking a single bucket.

## Links

[Plan §Strategy](../../internal/initiatives/feature-audience-restructure/feature-audience-restructure-plan.md#strategy)

---
