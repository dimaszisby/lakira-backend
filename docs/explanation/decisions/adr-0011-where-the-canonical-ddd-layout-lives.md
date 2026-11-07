# ADR-0011 — Where the canonical DDD layout lives

- **Status:** Proposed
- **Date:** 2026-05-01
- **Related:** Revisited by [ADR-0037](./adr-0037-resolve-canonical-ddd-layout-disagreement.md) (Proposed) — that ADR would flip this one to Accepted (revised) once implemented.
- **Origin:** `ADR-003` in the SaaS readiness audit kit — [`saas-readiness`](../../internal/audits/saas-readiness/decisions.md)

---

## Context

Audit gap [P1-10.1] documents drift across feature slices: `metric` lacks `dto.ts`, `metric-settings` has both `infrastructure/mappers/` and `infrastructure/persistence/`, `metric-log` uses `infrastructure/access/` instead of `infrastructure/providers/`, `analytics` uses `validators.ts` instead of `schema.zod.ts`. The `auth` feature is the canonical reference per `.claude/rules/architecture.md`.

## Decision

The auth slice is the reference. All other slices migrate to match its layout:

```
features/{name}/
  domain/
    entities/
    repositories/
    [services/]              # only when domain logic does not fit on an entity
    [value-objects/]         # only when invariants are non-trivial
  application/
    use-cases/
    queries/
    ports/
  infrastructure/
    http/                    # router.ts, controller.ts, dto.ts, schema.zod.ts
    persistence/
      models/
      repositories/
      mappers/
    providers/               # port adapters that are not the persistence repo
  feature.ts
  index.ts
```

## Options considered

- _Match the most recent feature (`metric-category`)._ Rejected: it is the only slice with VOs and a domain service, which most slices do not need.
- _Codify two layouts (simple/complex) and tag each slice._ Rejected: adds cognitive load; the canonical layout already accommodates both via the bracketed-optional dirs.

## Consequences

- Migration effort across `metric`, `metric-log`, `metric-settings`, `metric-category`, `analytics`. M-effort overall.
- One ESLint rule (or unit test) becomes the source of truth.
- Forkers see one canonical pattern.

## Links

- `audit-2026-05-01.md` § [P1-10.1]
- `.claude/rules/architecture.md`
- `src/features/shared/auth/` (reference)

---
