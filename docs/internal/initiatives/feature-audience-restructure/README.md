# Feature Audience Restructure

## Overview

- **Purpose**: Restructure `src/features/` from a flat layout into an audience-scoped tree (`public/`, `admin/`, `shared/`) so that user-facing modules, internal/ops modules, and cross-cutting modules are visibly separated. This is foundational work for the future SaaS split between end-user and admin/ops surfaces.
- **DRI**: @dimaszisby (single-developer)
- **Status**: **Shipped 2026-05-01** in PR #33. `src/features/public/` and `src/features/shared/`
  are live, and later kits (jwt, multi-tenancy, saas-readiness) cite those paths as fact.
  The checklist below was never ticked off — treat the code, not the checkboxes, as the record.
  The `admin/` bucket from ADR-0013 is still unused; the only admin surface is
  `/api/v1/admin/_ping`, mounted directly in `src/server.ts`.

## Scope

### In Scope

- Move every existing slice under `src/features/` into one of three audience buckets:
  - `src/features/public/` — user-facing slices.
  - `src/features/admin/` — internal/ops slices (created empty as a foundation; no slices live here today).
  - `src/features/shared/` — slices used by both audiences (e.g., `auth`).
- Wire two route namespaces in `src/server.ts`:
  - `/api/v1/...` (existing) — public router mounts.
  - `/api/v1/admin/...` (new) — admin router shell + `requireAdmin` middleware. **No admin routes exist yet** — the namespace is wired empty as scaffolding.
- Add a tiny `requireAdmin` middleware that builds on the existing `authMiddleware` + `req.user.role === "admin"` check.
- Update internal feature imports to use the new audience-scoped paths.
- Preserve every existing public API path verbatim.

### Out of Scope

- Any business-logic change inside use-cases, queries, controllers, or domain entities.
- Schema or migration changes (no DB touches).
- Modifications to: `src/config`, `src/constants`, `src/infrastructure`, `src/lib`, `src/migrations`, `src/shared` (app-level), `src/tests`, `src/types`, `src/utils`, `src/worker.ts`.
- Splitting the User entity or introducing a separate `AdminUser` model — the existing `role: "user" | "admin"` column is the source of truth.
- New admin features. The `features/admin/` tree is a foundation only.
- ESLint rule changes that enforce audience boundaries (deferred — see [decisions.md](./decisions.md) ADR-004).

## Audience Classification (Today's Slices)

| Slice             | Audience | Rationale                                                                              |
| ----------------- | -------- | -------------------------------------------------------------------------------------- |
| `auth`            | `shared` | Login/register/JWT/password-reset serve both audiences; User entity is the join point. |
| `metric`          | `public` | End-user metric CRUD.                                                                  |
| `metric-category` | `public` | End-user category management.                                                          |
| `metric-log`      | `public` | End-user logging measurements.                                                         |
| `metric-settings` | `public` | End-user per-metric configuration.                                                     |
| `analytics`       | `public` | End-user visualization queries on their own data.                                      |
| _(none yet)_      | `admin`  | Reserved for future internal/ops features.                                             |

## Commands & Tooling

- `npm run typecheck` — gate between every phase.
- `npm run lint` — must stay green.
- `npm run test:unit && npm run test:integration` — run before declaring a phase done.
- `npm run docs:openapi:generate` — re-run after Phase 7; verify zero diff (no public path changes).
- No new dependencies are required.

## Verification

- After every phase: `npm run typecheck` MUST pass before the next phase starts.
- After Phase 7 (final): `npm run lint`, full test suite, OpenAPI diff, and a manual `git diff src/server.ts` to confirm only route mounting changed.
- Smoke test: hit `/api/v1/health`, `/api/v1/auth/login`, `/api/v1/metrics`, `/api/v1/admin/_ping` (the only admin route, a placeholder 200 OK) with `curl` to confirm the namespaces resolve.

## References

- [Plan](./feature-audience-restructure-plan.md) — phased migration roadmap.
- [Checklist](./feature-audience-restructure-checklist.md) — granular task tracker.
- [Ticket](./feature-audience-restructure-ticket.md) — work-package summary / acceptance criteria.
- [Decisions (ADR)](./decisions.md) — architectural decisions captured during planning.
- [Incidents](./incidents.md) — issues encountered during rollout.
- [Metrics Tracker](./metrics-tracker.md) — quantitative progress (files moved, tsc time, etc.).
- Related rules: `.claude/rules/architecture.md`, `.claude/rules/api-design.md`, `.claude/rules/security.md`.
- Prior architectural kit: [`feature-vertical-slice-migration/`](../feature-vertical-slice-migration/README.md) — reuse its conventions.
