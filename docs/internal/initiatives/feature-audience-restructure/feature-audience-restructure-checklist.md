# Feature Audience Restructure — Checklist

Track each task with `[ ]` → `[x]`. Append `commit: <sha>` (or branch ref) to every completed item per the doc-kit guideline. **Stop and re-plan** if any phase exit criterion fails.

---

## Phase 0 — Pre-flight & Scaffolding

- [ ] Create branch `feature/feature-audience-restructure` off `dev`.
- [ ] Create empty dirs: `src/features/public/`, `src/features/admin/`, `src/features/shared/`. Add `.gitkeep` files.
- [ ] Add a temporary alias-probe to confirm path-alias plumbing works at both `tsc` and runtime:
  - [ ] Add probe entry to `tsconfig.json` and `tsconfig.build.json`: `"@/features/__alias_probe/*": ["src/features/__alias_probe/*"]`.
  - [ ] Create `src/features/__alias_probe/hello.ts` exporting `export const PROBE = "ok";`.
  - [ ] Import `PROBE` from a throwaway TS file under `src/features/__alias_probe/__test.ts`; run `npm run typecheck` — must pass.
  - [ ] Run `npm run build`; verify the generated JS resolves the alias (spot-check `dist/`).
  - [ ] Delete the probe file and entry; ensure `npm run typecheck` still passes.
- [ ] Verify `scripts/resolve-build-aliases.mjs` honors `tsconfig.build.json` `paths`. Note any required edit; if surprising, log to [incidents.md](./incidents.md).
- [ ] Confirm Jest resolves tsconfig paths. If not, locate the moduleNameMapper or `ts-jest` config and document required entries (do **not** edit yet).
- [ ] **Exit gate**: `npm run typecheck` passes.

## Phase 1 — Move `auth` → `shared/auth`

- [ ] `git mv src/features/auth src/features/shared/auth`.
- [ ] Add tsconfig path aliases (in **both** `tsconfig.json` and `tsconfig.build.json`):
  - [ ] `"@/features/auth/*": ["src/features/shared/auth/*"]`
  - [ ] `"@/features/auth": ["src/features/shared/auth/index"]`
- [ ] Update `src/server.ts`:
  - [ ] `import { authRouter } from "./features/shared/auth/index.js";`
  - [ ] `import { authMiddleware } from "./features/shared/auth/infrastructure/http/authMiddleware.js";`
- [ ] Inside `src/features/shared/auth/**`, rewrite same-feature `@/features/auth/...` imports to relative paths (cosmetic; keeps the slice self-contained). Cross-feature imports stay alias-based.
- [ ] Run `npm run typecheck` — must pass.
- [ ] Run `npm run lint` — must pass.
- [ ] Smoke: start dev server (`npm run dev`), `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"x","password":"y"}'` — expect 400/401, NOT 404.
- [ ] **Exit gate**: typecheck + lint green; auth smoke OK.

## Phase 2 — Move `metric` → `public/metric`

- [ ] `git mv src/features/metric src/features/public/metric`.
- [ ] Add tsconfig path aliases (both files):
  - [ ] `"@/features/metric/*": ["src/features/public/metric/*"]`
  - [ ] `"@/features/metric": ["src/features/public/metric/index"]`
- [ ] Update `src/server.ts` import: `./features/public/metric/index.js`.
- [ ] Inside `src/features/public/metric/**`, rewrite same-feature alias imports to relative.
- [ ] Run `npm run typecheck` — must pass.
- [ ] **Exit gate**: typecheck green.

## Phase 3 — Move `metric-category` → `public/metric-category`

- [ ] `git mv src/features/metric-category src/features/public/metric-category`.
- [ ] Add tsconfig path aliases (both files):
  - [ ] `"@/features/metric-category/*": ["src/features/public/metric-category/*"]`
  - [ ] `"@/features/metric-category": ["src/features/public/metric-category/index"]`
- [ ] Update `src/server.ts` import: `./features/public/metric-category/index.js`.
- [ ] Inside the moved tree, rewrite same-feature alias imports to relative.
- [ ] Run `npm run typecheck` — must pass.
- [ ] **Exit gate**: typecheck green.

## Phase 4 — Move `metric-settings` → `public/metric-settings`

- [ ] `git mv src/features/metric-settings src/features/public/metric-settings`.
- [ ] Add tsconfig path aliases (both files):
  - [ ] `"@/features/metric-settings/*": ["src/features/public/metric-settings/*"]`
  - [ ] `"@/features/metric-settings": ["src/features/public/metric-settings/index"]`
- [ ] Update `src/server.ts` import: `./features/public/metric-settings/index.js`.
- [ ] Inside the moved tree, rewrite same-feature alias imports to relative.
- [ ] Run `npm run typecheck` — must pass.
- [ ] **Exit gate**: typecheck green.

## Phase 5 — Move `metric-log` → `public/metric-log`

- [ ] `git mv src/features/metric-log src/features/public/metric-log`.
- [ ] Add tsconfig path aliases (both files):
  - [ ] `"@/features/metric-log/*": ["src/features/public/metric-log/*"]`
  - [ ] `"@/features/metric-log": ["src/features/public/metric-log/index"]`
- [ ] Update `src/server.ts` imports for `metricLogRouter`, `buildMetricLogFeature`, `overrideMetricLogFeatureForTest` to point at `./features/public/metric-log/...`.
- [ ] Inside the moved tree, rewrite same-feature alias imports to relative.
- [ ] Verify `src/worker.ts` still resolves (no edits — locked). Run `npm run typecheck` from repo root.
- [ ] Run unit tests for metric-log: `npx jest --runInBand --selectProjects unit -- features/public/metric-log`.
- [ ] **Exit gate**: typecheck green; metric-log unit tests green.

## Phase 6 — Move `analytics` → `public/analytics`

- [ ] `git mv src/features/analytics src/features/public/analytics`.
- [ ] Add tsconfig path aliases (both files):
  - [ ] `"@/features/analytics/*": ["src/features/public/analytics/*"]`
  - [ ] `"@/features/analytics": ["src/features/public/analytics/index"]`
- [ ] Update `src/server.ts` imports for `visualizationRouter` and `AnalyticsVisualizationInvalidationAdapter` to point at `./features/public/analytics/...`.
- [ ] Inside the moved tree, rewrite same-feature alias imports to relative.
- [ ] Run `npm run typecheck` — must pass.
- [ ] **Exit gate**: typecheck green.

## Phase 7 — Wire `/api/v1/admin` namespace

- [ ] Create `src/features/shared/auth/infrastructure/http/requireAdmin.ts` (body shown in the plan, Phase 7).
- [ ] Re-export `requireAdmin` from `src/features/shared/auth/index.ts`.
- [ ] In `src/server.ts`:
  - [ ] Import `Router` from `express` (if not already) and `requireAdmin` from the new shared module.
  - [ ] Build `adminRouter`: `const adminRouter = Router(); adminRouter.use(authMiddleware, requireAdmin);`
  - [ ] Mount placeholder: `adminRouter.get("/_ping", (_req, res) => res.json({ status: "ok", scope: "admin" }));`
  - [ ] `app.use("/api/v1/admin", adminRouter);` — placed AFTER existing public route mounts and BEFORE swagger/error handler.
- [ ] Run `npm run typecheck` — must pass.
- [ ] Run `npm run lint` — must pass.
- [ ] Smoke (manual):
  - [ ] `curl -i http://localhost:5000/api/v1/admin/_ping` → expect **401** (no token).
  - [ ] `curl -i -H "Authorization: Bearer <user-jwt>" .../admin/_ping` → expect **403**.
  - [ ] `curl -i -H "Authorization: Bearer <admin-jwt>" .../admin/_ping` → expect **200**.
- [ ] **Exit gate**: typecheck + lint + 3-way smoke matrix all green.

## Phase 8 — Validation & Cleanup

- [ ] `npm run typecheck` — green.
- [ ] `npm run lint` — green.
- [ ] `npm run format:check` — green.
- [ ] `npm run test:unit` — green.
- [ ] `docker compose up -d` (Postgres + Redis), `npm run test:integration` — green.
- [ ] `npm run docs:openapi:generate`; verify `git diff -- docs/reference/api/` is empty (no public-path drift).
- [ ] Manual smoke matrix (full):
  - [ ] `GET /api/v1/health` → 200.
  - [ ] `POST /api/v1/auth/login` → 200/401 as appropriate.
  - [ ] `GET /api/v1/metrics` (auth'd) → 200.
  - [ ] `GET /api/v1/metric-categories`, `/api/v1/metric-logs`, `/api/v1/metric-settings`, `/api/v1/analytics/...` — sample one of each, expect non-404.
  - [ ] Admin matrix (no token / user / admin) — 401 / 403 / 200.
- [ ] Constraint audit: `git diff --name-only main...HEAD | grep -E '^src/(config|constants|infrastructure|lib|migrations|shared/|tests|types|utils|worker\.ts)'` returns **empty**.
- [ ] Update [metrics-tracker.md](./metrics-tracker.md) with final numbers.
- [ ] Log every architectural decision in [decisions.md](./decisions.md) with PR links.
- [ ] Open PR `feature/feature-audience-restructure` → `dev`; reference this kit in the description.
- [ ] **Exit gate**: PR opened, CI green, ready for review.

---

## Post-Merge Follow-ups (out of scope for this PR, but track here)

- [ ] Audit `docs/reference/api/` references for any path that mentions `src/features/<feature>/...` and refresh.
- [ ] Plan a follow-up sweep to rewrite cross-feature imports to use audience-prefixed paths and retire the alias-preservation shim (ADR-003).
- [ ] Decide whether to add an ESLint `no-restricted-imports` rule for cross-audience imports (ADR-004).
- [ ] When the first real admin slice lands, replace the `/_ping` placeholder.
