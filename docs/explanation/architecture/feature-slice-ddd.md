# Feature Boundary Rules

- Timestamp: 2025-12-14T18:13:00+07:00
- Owners: Platform ENG (feature-slice migration pod)
- Checklist Link: [Consistency Checklist v2](../../internal/initiatives/feature-vertical-slice-migration/reviews/2025-12-14/lakira-be-feature-slice-migration-consistency-checklist-v2.md)

## Purpose

This note captures the non-negotiable boundaries every feature slice must honor while the vertical-slice migration is underway. The consistency checklist references these rules during code reviews; keeping them in a standalone doc makes it easier for new contributors (or external auditors) to understand why a change request is blocked.

## Guardrails

| ID  | Rule                                                                                                                                                                                                                        | Why it exists                                                                                            | Allowed escape hatches                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Router/controller boundaries** — Slice routers/controllers cannot import HTTP handlers from another slice. Composition happens via application ports, not controller reuse.                                               | Prevents “mega routers” that mix domains and makes slice-level tests reliable.                           | Move the route into the owning slice or expose a formal port from the source slice’s application layer.                        |
| D2  | **Validation at the edge** — Routers call `validate(...)` and controllers read from `req.validated` (via `pickValidated`). No manual schema parsing inside controllers.                                                     | Ensures every endpoint benefits from the same request sanitization and removes duplicated parsing logic. | None. New schemas live inside the owning feature; shared middleware already handles edge cases.                                |
| D3  | **Unified success envelope** — Controllers respond through `successResponse(...)`. Custom `res.json` payloads are not allowed unless a ticket documents the exception.                                                      | Keeps client expectations consistent and simplifies contract tests / OpenAPI docs.                       | Documented exception in checklist with product approval and follow-up ticket to reconcile.                                     |
| D4  | **Feature-owned schemas** — Validators and DTO mappers live inside `src/features/<audience>/<slice>/infrastructure/http`. No drifting back to `src/types/api`.                                                              | Keeps schema drift localized and lets OpenAPI generation pull from a single source.                      | Shared schema only when two slices co-own a contract (rare); must be recorded in checklist evidence.                           |
| D5  | **Override convention** — Test hooks export `override<Feature>ForTest` to replace dependencies in isolation. No `__set*` globals or direct mutation.                                                                        | Normalizes test bootstrap scripts and keeps override churn predictable.                                  | None; add optional helpers that call `override<Feature>ForTest` if ergonomics are needed.                                      |
| D6  | **Cache ports, not friend imports** — Caches invalidate through slice-owned adapters/ports (e.g., `MetricLogCacheRedis` depends on `VisualizationInvalidationPort`). No direct `import` from analytics/visualization infra. | Keeps infra dependencies acyclic so slices can be deployed/tested independently.                         | Add a port in `src/shared/application/ports` or the owning feature, document in this file, and inject via the feature builder. |

## Cross-feature imports (ADR-0044)

Added 2026-09-24; the guardrails above predate it.

- **A feature's public surface is `public.ts`, not `index.ts`.** `index.ts` builds the feature's
  routers when it is imported, so importing it from a sibling pulls in that feature's composition
  root and can cycle. `public.ts` holds what other features may use and imports no routers.
- **Enforced by ESLint**, not only by review: `no-restricted-imports` in `eslint.config.mjs` bans
  importing another feature's `domain/`, `application/` or `infrastructure/` directly
  (`src/features/**` only — see the open todo on widening it).
- **Domain code raises `DomainError`, not `AppError`**; HTTP status codes live only in the error
  middleware.
- **The 11 cross-feature Sequelize associations are frozen** at an exact count by
  `__tests__/unit/architecture.test.ts`. Changing the count is deliberate and must be recorded.

Full decision:
[ADR-0044](../decisions/adr-0044-feature-boundaries-and-their-frozen-exceptions.md).

## Enforcement Workflow

1. During development, run the [consistency checklist](../../internal/initiatives/feature-vertical-slice-migration/reviews/2025-12-14/lakira-be-feature-slice-migration-consistency-checklist-v2.md) tickets sequentially. Each ticket requires evidence (files touched, commands run, grep proof when relevant).
2. During PR reviews, copy/paste the relevant guardrail ID (e.g., “D1 violation”) so the author can map the feedback back to this doc.
3. When we need to change or add a guardrail, update this file first, then reference it from the plan/checklist to keep the historical record intact.

## Related Documents

- [Shared Middleware + Cache Spec](./shared-middleware.md)
- [Consistency Plan v2](../../internal/initiatives/feature-vertical-slice-migration/reviews/2025-12-14/lakira-be-feature-slice-migration-consistency-plan-v2.md)
