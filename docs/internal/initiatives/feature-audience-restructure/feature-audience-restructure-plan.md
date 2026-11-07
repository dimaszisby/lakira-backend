# Feature Audience Restructure — Plan

## Context & Goals

`src/features/` is currently flat — six slices (`auth`, `metric`, `metric-category`, `metric-log`, `metric-settings`, `analytics`) sit at the same level with no separation between user-facing and admin/ops concerns. As the product moves toward SaaS, we need a visible boundary between:

- **`public/`** — surfaces consumed by end users (the React app).
- **`admin/`** — internal/ops surfaces protected by `requireAdmin` (today: empty foundation).
- **`shared/`** — slices that legitimately serve both audiences (today: `auth`).

The aim is a **structural refactor only**: zero behavior change, zero public API path change, zero touched migrations or domain logic. After this work lands, future admin features (user management, audit log readers, billing ops, etc.) have a clear home and a pre-wired `/api/v1/admin/*` namespace.

### Goals

1. Every existing slice lives under exactly one of `public/`, `admin/`, `shared/`.
2. `src/server.ts` mounts public slices at `/api/v1/...` (unchanged paths) and an admin router shell at `/api/v1/admin` guarded by `authMiddleware` + `requireAdmin`.
3. No file under the **locked dirs** (`src/config`, `src/constants`, `src/infrastructure`, `src/lib`, `src/migrations`, `src/shared`, `src/tests`, `src/types`, `src/utils`, `src/worker.ts`) is touched. Existing `@/features/<feature>/...` imports from those locked dirs continue to resolve via TypeScript path aliases.
4. Each phase passes `npm run typecheck` (`tsc --noEmit`) before the next phase begins.
5. The full test suite (unit + integration) is green at the end.

### Non-Goals

- No business-logic edits, no DTO/schema changes, no DB schema changes.
- No new admin feature implementations — `features/admin/` is a placeholder.
- No ESLint rule for audience boundaries (deferred; see ADR-004).

## Discovery Findings (must read before starting)

These are the load-bearing facts the plan is built on. If any prove wrong during execution, **stop and re-plan**.

1. **Six slices today, all flat under `src/features/`**. Each follows the standard DDD layout (`domain/`, `application/`, `infrastructure/`, `feature.ts`, `index.ts`).
2. **Cross-feature imports are pervasive** and use the `@/features/<feature>/...` alias:
   - Every router imports `authMiddleware` from `@/features/auth/infrastructure/http/authMiddleware.js`.
   - Sequelize models cross-reference each other (`metric` ↔ `metric-category` ↔ `metric-log` ↔ `metric-settings`; `metric-category` and `password-reset-token` reference `User`).
   - `metric/infrastructure/http/controller.ts` imports `buildAnalyticsFeature` from `@/features/analytics/feature.js`.
   - `analytics` imports `MetricLog` model from `metric-log`.
3. **Locked dirs import features**. The following files (which we cannot touch) reference `@/features/...`:
   - `src/server.ts` (route imports — but server.ts is **not** locked; it's modifiable since it's the route wiring target).
   - `src/worker.ts` (`metric-log` access/cache/use-case imports).
   - `src/types/dtos/metric.dto.ts` (imports `metric/infrastructure/http/schema.zod.js`, `metric-settings/infrastructure/http/dto.js`, `metric-log/infrastructure/http/dto.js`).
   - `src/types/domain/metric.domain.ts` (imports `metric-category/domain/entities/MetricCategory.js`).
   - `src/utils/token-generator.ts` (imports `auth/infrastructure/persistence/models/user.sequelize.js`).
   - `src/utils/db-helper.ts` (imports `metric` and `metric-category` Sequelize models).
   - `src/utils/mappers/metric-log.mapper.ts`, `src/utils/mappers/metric.mapper.ts` (feature model imports).
   - `src/lib/openapi/openapi-schemas.ts` (feature schema imports).
   - `src/infrastructure/db/types.ts`, `src/infrastructure/db/models.ts` (model imports).
   - All these are constraint-locked. **Therefore the plan MUST preserve `@/features/<feature>/*` import paths via tsconfig aliases** — see ADR-002.
4. **Build mechanics**: `tsc -p tsconfig.build.json && node ./scripts/resolve-build-aliases.mjs`. Path aliases work at both compile and runtime; we just need to add new entries.
5. **`server.ts` is editable** (it's the route wiring target and is not in the locked list).
6. **No admin feature exists today.** `User` model has `role: "user" | "admin"` ENUM, but no admin routes or guards. `requireAdmin` middleware is a new file; it is the smallest possible new piece of business code and is required to make the `/api/v1/admin` namespace meaningful.

## Strategy

### Path-Alias Preservation (the linchpin)

Add per-feature TypeScript path-alias entries so that **every existing `@/features/<feature>/...` import keeps resolving after the move, with zero edits to locked files**. Example:

```jsonc
"paths": {
  "@/*": ["src/*"],
  "@utils/*": ["src/utils/*"],
  "@config/*": ["src/config/*"],
  // Audience-aware feature aliases (new):
  "@/features/auth/*":            ["src/features/shared/auth/*"],
  "@/features/auth":              ["src/features/shared/auth/index"],
  "@/features/metric/*":          ["src/features/public/metric/*"],
  "@/features/metric":            ["src/features/public/metric/index"],
  "@/features/metric-category/*": ["src/features/public/metric-category/*"],
  "@/features/metric-category":   ["src/features/public/metric-category/index"],
  "@/features/metric-log/*":      ["src/features/public/metric-log/*"],
  "@/features/metric-log":        ["src/features/public/metric-log/index"],
  "@/features/metric-settings/*": ["src/features/public/metric-settings/*"],
  "@/features/metric-settings":   ["src/features/public/metric-settings/index"],
  "@/features/analytics/*":       ["src/features/public/analytics/*"],
  "@/features/analytics":         ["src/features/public/analytics/index"]
}
```

**Both `tsconfig.json` and `tsconfig.build.json` get the new entries.** Verify the runtime resolver script (`scripts/resolve-build-aliases.mjs`) honors them — see Phase 0.

### Order of Moves

The order is chosen to keep each intermediate phase reviewable in a small diff, **not** because correctness depends on it (path aliases mean the order is logically interchangeable). We move the most-depended-on first so each subsequent phase can be reviewed against a stable foundation.

1. `auth` → `shared/auth` (highest fanout — every router uses `authMiddleware`).
2. `metric` → `public/metric` (referenced by every other public slice and types/utils).
3. `metric-category` → `public/metric-category`.
4. `metric-settings` → `public/metric-settings`.
5. `metric-log` → `public/metric-log`.
6. `analytics` → `public/analytics`.

### Internal Imports Inside Moved Code

Inside a moved slice, prefer **relative imports** (`../../domain/entities/AuthUser.js`) where they already are; for cross-feature imports inside a moved slice, **continue using the `@/features/<feature>/...` alias**. The aliases now point at audience-scoped paths, so everything still resolves and the refactor stays minimal. We deliberately do **not** rewrite cross-feature imports to use new audience-prefixed paths in this initiative — that's a follow-up cleanup (see ADR-003).

## Phases & Milestones

> **Gate between every phase**: `npm run typecheck` MUST pass. If anything else (lint, build) regresses, stop and triage before continuing.

### Phase 0 — Pre-flight & Scaffolding

- Branch from `dev`: `feature/feature-audience-restructure`.
- Create empty target dirs: `src/features/public/`, `src/features/admin/`, `src/features/shared/` with `.gitkeep`.
- Smoke-prove the path-alias mechanism end-to-end:
  - Add a no-op alias `@/features/__alias_probe/*` → `src/features/__alias_probe/*` to both `tsconfig.json` and `tsconfig.build.json`.
  - Create `src/features/__alias_probe/hello.ts` exporting a constant; import it from a throwaway test that runs under tsc.
  - Run `npm run typecheck` and `npm run build` to confirm both honor the alias.
  - Delete the probe.
- Confirm `scripts/resolve-build-aliases.mjs` reads from `tsconfig.build.json` and resolves aliases at runtime; if it does not auto-pick up new entries, document the change required (incident-log it if surprising).
- **Exit criteria**: `tsc --noEmit` passes; new dirs exist and are tracked.

### Phase 1 — Move `auth` → `shared/auth`

- `git mv src/features/auth src/features/shared/auth`.
- Add tsconfig aliases for `auth` (entries shown in Strategy section).
- Run a global path scan inside `src/features/shared/auth/**` and rewrite any **same-feature** internal imports that still reference `@/features/auth/...` as relative paths (cosmetic — keeps the slice self-contained). Cross-feature imports stay alias-based.
- Update `src/server.ts` import for `authRouter` and `authMiddleware`:
  - `import { authRouter } from "./features/shared/auth/index.js"`.
  - `import { authMiddleware } from "./features/shared/auth/infrastructure/http/authMiddleware.js"`.
- **Exit criteria**: `tsc --noEmit` passes; `npm run lint` passes; `/api/v1/auth/login` smoke test passes locally.

### Phase 2 — Move `metric` → `public/metric`

- `git mv src/features/metric src/features/public/metric`.
- Add tsconfig aliases for `metric`.
- Update `src/server.ts` import for `metricRouter` to `./features/public/metric/index.js`.
- **Exit criteria**: typecheck green.

### Phase 3 — Move `metric-category` → `public/metric-category`

- `git mv` + alias entries + `server.ts` import update.
- **Exit criteria**: typecheck green.

### Phase 4 — Move `metric-settings` → `public/metric-settings`

- `git mv` + alias entries + `server.ts` import update.
- **Exit criteria**: typecheck green.

### Phase 5 — Move `metric-log` → `public/metric-log`

- `git mv` + alias entries + `server.ts` import update.
- Update `src/worker.ts`? **No** — worker.ts is locked. Aliases must keep its imports working; verify after the move.
- **Exit criteria**: typecheck green; `npm test -- --selectProjects unit` for metric-log slice green.

### Phase 6 — Move `analytics` → `public/analytics`

- `git mv` + alias entries + `server.ts` import update.
- **Exit criteria**: typecheck green.

### Phase 7 — Wire `/api/v1/admin` Namespace

- Create `src/features/shared/auth/infrastructure/http/requireAdmin.ts`. Tiny, behavior-narrow:

  ```ts
  import { Response, NextFunction } from "express";
  import { AuthRequest } from "@/types/request.context.js";
  import AppError from "@/utils/AppError.js";

  export const requireAdmin = (
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) return next(new AppError("Unauthorized", 401));
    if (req.user.role !== "admin")
      return next(new AppError("Forbidden: admin access required", 403));
    next();
  };
  ```

- Re-export it from `src/features/shared/auth/index.ts`.
- In `src/server.ts`, after the existing public route mounts, add:

  ```ts
  import { Router } from "express";
  // ... existing imports
  import { requireAdmin } from "./features/shared/auth/infrastructure/http/requireAdmin.js";

  const adminRouter = Router();
  adminRouter.use(authMiddleware, requireAdmin);
  // Placeholder so the namespace is reachable for smoke tests:
  adminRouter.get("/_ping", (_req, res) =>
    res.json({ status: "ok", scope: "admin" }),
  );

  app.use("/api/v1/admin", adminRouter);
  ```

- **Exit criteria**: typecheck green; `curl -H "Authorization: Bearer <admin-jwt>" /api/v1/admin/_ping` returns 200; same call with a non-admin JWT returns 403; no auth header returns 401.

### Phase 8 — Validation & Cleanup

- Full check sweep:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run format:check`
  - `npm run test:unit`
  - `npm run test:integration` (requires Postgres + Redis up via `docker compose up -d`).
  - `npm run docs:openapi:generate` and confirm `git diff docs/reference/api/` is empty (no public path changes).
- Manual smoke matrix:
  - `GET /api/v1/health` — 200.
  - `POST /api/v1/auth/login` — 200/401 as appropriate.
  - `GET /api/v1/metrics` (auth'd) — 200.
  - `GET /api/v1/admin/_ping` (no token) — 401.
  - `GET /api/v1/admin/_ping` (user JWT) — 403.
  - `GET /api/v1/admin/_ping` (admin JWT) — 200.
- Update `metrics-tracker.md` with final numbers.
- Open the PR; link this kit in the description.

## Success Criteria

- All six existing slices live under their assigned audience folder. `find src/features -maxdepth 2 -type d` shows only `public/`, `admin/`, `shared/` at depth 1.
- `npm run typecheck`, `npm run lint`, full test suite — all green.
- Zero changes to `src/config`, `src/constants`, `src/infrastructure`, `src/lib`, `src/migrations`, `src/shared`, `src/tests`, `src/types`, `src/utils`, `src/worker.ts`. Confirmed via `git diff --name-only main...HEAD | grep -E '^src/(config|constants|infrastructure|lib|migrations|shared|tests|types|utils|worker.ts)'` returning nothing.
- OpenAPI diff is empty for public paths.
- `/api/v1/admin/_ping` returns 200/401/403 according to caller's role.

## Risks & Mitigations

| Risk                                                                                                        | Likelihood | Mitigation                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/resolve-build-aliases.mjs` does not honor new alias entries → runtime breaks despite tsc passing   | Medium     | Phase 0 alias-probe smoke test exercises both `tsc` and `npm run build`. If the script needs updating, log an incident and re-evaluate (the script lives outside locked dirs, so editing is allowed). |
| Jest module resolution differs from tsc paths → tests fail despite tsc passing                              | Medium     | After Phase 1, immediately run `npm run test:unit -- --selectProjects unit features/shared/auth` to validate Jest resolves new paths. Jest config typically reads from tsconfig — confirm.            |
| ESLint banned-import rules block the new audience paths                                                     | Low        | Skim `.eslintrc*` for `no-restricted-imports` patterns. The architecture rule bans `src/services/**`/`src/controllers/**`/`src/routes/**`, none of which we use.                                      |
| Sequelize model registration order changes cause association failures                                       | Low        | Models are registered via `src/infrastructure/db/models.ts` (locked). Aliases preserve its imports — no order change should occur. Verify with `npm run test:integration` in Phase 8.                 |
| OpenAPI generator emits a diff (e.g., due to a path-string change in a controller annotation)               | Low        | Phase 8 runs `npm run docs:openapi:generate` and diffs. If a diff appears, investigate whether it's whitespace or actual path change before merging.                                                  |
| `git mv` history loss when a directory crosses two parents                                                  | Low        | Use `git mv` per directory (not per file) and verify with `git log --follow src/features/shared/auth/feature.ts`.                                                                                     |
| Phase becomes too large and review/typecheck signal blurs                                                   | Medium     | One slice per phase. If a single slice grows too noisy, split into a sub-phase per layer (domain → application → infrastructure).                                                                     |
| `requireAdmin` middleware is judged "business logic" and violates the "no business logic change" constraint | Low        | We documented it as **scaffolding** for an empty namespace. The plan is explicit that the user must approve before execution; if rejected, omit Phase 7 and leave admin entirely unwired.             |

## Open Questions

1. **Should the alias-preservation shim be permanent, or removed in a follow-up cleanup?** Recommendation: keep for at least one release cycle; rewrite cross-feature imports to audience-prefixed paths in a follow-up sweep. Captured as ADR-003.
2. **Where should `requireAdmin` ultimately live** if it grows (e.g., to read tenant/role tables)? For now, `shared/auth/infrastructure/http/`. If admin authorization grows complex, extract to a future `features/shared/authorization/` slice.
3. **Should we add an ESLint rule** that blocks `public/*` from importing `admin/*` (and vice versa)? Out of scope for this initiative — see ADR-004; revisit once any admin slice exists.
4. **Tests directory mirroring** — `src/tests/` is locked, but conceptually tests will eventually want audience-aware folders. Note for a future tests-overhaul kit.
