# Ticket: Restructure `src/features/` into audience-scoped slices (`public/`, `admin/`, `shared/`)

## Summary

Convert the flat `src/features/` directory into an audience-scoped tree that visibly separates user-facing slices (`public/`), internal/ops slices (`admin/`, foundation only — empty today), and cross-cutting slices (`shared/`, e.g., `auth`). Wire a `/api/v1/admin` namespace guarded by `authMiddleware` + a new `requireAdmin` middleware. **Pure structural refactor**: no business-logic, schema, or public-path changes.

## Background

Today every slice (`auth`, `metric`, `metric-category`, `metric-log`, `metric-settings`, `analytics`) lives at the same level under `src/features/`. As Lakira moves toward SaaS, internal/ops surfaces (audit log readers, user management, feature flags, billing ops) need a clear home and an audience boundary. Doing the structural split **now**, before any admin slice is written, avoids retrofitting and gives future PRs an obvious destination.

The User entity already supports `role: "user" | "admin"` — the data model is ready. The missing pieces are the directory boundary and the route namespace. This ticket delivers both.

## Acceptance Criteria

- [ ] `src/features/` contains exactly three top-level dirs: `public/`, `admin/`, `shared/`.
- [ ] Existing slices live under:
  - `shared/auth`
  - `public/metric`, `public/metric-category`, `public/metric-log`, `public/metric-settings`, `public/analytics`
- [ ] `admin/` exists with a `.gitkeep` (no slices yet — foundation only).
- [ ] All existing `@/features/<feature>/...` imports continue to resolve via tsconfig path aliases. Verified by running `npm run typecheck` and `npm run build` from a clean checkout.
- [ ] `src/server.ts` mounts:
  - All current public routers at their existing `/api/v1/...` paths (no path drift).
  - A new admin router at `/api/v1/admin` guarded by `authMiddleware` + `requireAdmin`, with a single placeholder `GET /_ping` returning `{status:"ok", scope:"admin"}`.
- [ ] `requireAdmin` middleware enforces: 401 if no `req.user`, 403 if `req.user.role !== "admin"`, otherwise `next()`.
- [ ] Locked dirs untouched: `git diff --name-only main...HEAD` shows no changes under `src/config`, `src/constants`, `src/infrastructure`, `src/lib`, `src/migrations`, `src/shared`, `src/tests`, `src/types`, `src/utils`, or `src/worker.ts`.
- [ ] OpenAPI spec is unchanged for public paths (`git diff -- docs/reference/api/` empty after `npm run docs:openapi:generate`).
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration` — all green.
- [ ] Each phase boundary recorded a passing `tsc --noEmit` before continuing (evidence in [checklist](./feature-audience-restructure-checklist.md) entries).

## Out of Scope

- Any business-logic, DTO, schema, or DB-migration change.
- New admin slices or controllers beyond the `/_ping` placeholder.
- Splitting the `User` entity into `User` / `AdminUser`.
- Rewriting cross-feature imports to use audience-prefixed paths (deferred — ADR-003).
- ESLint rule for cross-audience import enforcement (deferred — ADR-004).
- Test directory restructure to mirror audience scope.
- Frontend / API consumer changes (no public path moves).

## Dependencies / Stakeholders

- **DRI**: @dimaszisby
- **Reviewers**: any backend reviewer; flag the ADRs for explicit acknowledgment.
- **Branch**: `feature/feature-audience-restructure` (off `dev`).
- **Branch promotion**: feature → `dev` → `staging` → `main` per the team branch model. No direct PRs to `staging` or `main`.
- **CI**: existing pipeline (lint, typecheck, unit, integration, security delta). No CI changes required.
- **No external dependencies** (no new npm packages, no env vars, no migrations).

## Rollback

Each phase is a single `git mv` + tsconfig alias addition + `server.ts` import path change. Rollback for any individual phase: revert the phase commit; alias entries can stay (harmless if the dir isn't yet split). Full rollback: revert the merge commit on `dev`.

## Links

- [README](./README.md)
- [Plan](./feature-audience-restructure-plan.md)
- [Checklist](./feature-audience-restructure-checklist.md)
- [Decisions](./decisions.md)
- [Incidents](./incidents.md)
- [Metrics Tracker](./metrics-tracker.md)
