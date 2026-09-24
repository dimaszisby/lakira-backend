# Routers at module scope — Checklist

## Phase 0 — Prove the hazard, write the guard

- [x] AC-3 experiment on unmodified code: `metric-log/feature.ts` and `metric/.../dto.ts` import
      from sibling `index.js`. **9 failed / 592 passed** (3 suites), the todo's exact count; one
      trace starts at `metric-log/.../controller.ts:22`, the module-scope `buildMetricLogFeature()`
      (`MetricAccessSequelize is not a constructor`). Reverted.
- [x] `__tests__/unit/architecture.test.ts` — "feature modules construct nothing on import";
      run against unmodified code and see it fail — **failed, listing 18 constructions** (8 router
      instances in 6 files, 8 controller slots in 7 files, `authMiddleware`, analytics' bare
      `Router()`)

## Phase 1 — Make imports construction-free

- [x] `src/features/*/*/infrastructure/http/router.ts` (5) and `organization.router.ts` — no
      module-scope instances; analytics gets `createVisualizationRouter()`
- [x] `src/features/*/*/index.ts` (6) — router factories and `buildXFeature` only
- [x] Controllers (7) — lazy `getFeature()`; `override*ForTest` unchanged
- [x] `src/features/shared/auth/infrastructure/http/authMiddleware.ts` — lazy, same export
- [x] `src/server.ts` — creates and mounts every router; analytics through its index
- [x] `__tests__/unit/features/analytics/infrastructure/http/router.test.ts` — calls the factory

## Phase 2 — Enforce the surface

- [x] `eslint.config.mjs` — sibling `index` / bare alias / `feature.js` ban; D-04 exemption; freeze
      comment updated. Proven against a deliberate violation (exit code checked)

## Phase 3 — Verify, then document

- [x] AC-3 experiment on the fixed code — unit 602/602 and integration 196 passed / 5 skipped
      with the same two files on sibling `index.js`; reverted
- [x] `.claude/rules/architecture.md` § Export Convention
- [x] `docs/explanation/architecture/feature-slice-ddd.md`, `.claude/skills/new-feature/SKILL.md`,
      `.claude/agents/ddd-inspector.md`, all five `public.ts` comments
      (`architecture-auditor.md` was already correct and is unchanged)
- [x] `docs/explanation/decisions/adr-0045-*.md` (D-01 and D-02 promoted) and its registry row;
      status note on ADR-0044
- [x] Todos: metric → analytics coupling (D-04); feature injection (D-01). Close
      `2026-09-22-todo-routers-constructed-at-module-scope`

## Discovered

- [x] Found: the todo's scope (routers only) was too small — controllers and `authMiddleware` also
      constructed at import. → in scope; identified during planning and confirmed by the AC-3 trace.
- [x] Found: `api-design.md`'s router example ended with `export const myRouter = createMyRouter()`.
      → in scope, updated.
- [x] Found: the ESLint boundary message told authors to "import another feature through its
      index.ts", the opposite of ADR-0044. → in scope, now points at `public.ts`.
- [x] Found: `src/server.ts` wires the real metric-log feature through
      `overrideMetricLogFeatureForTest`, a test hook doing production wiring. → out of scope, filed in
      `2026-09-24-todo-inject-features-into-router-factories`.
- [x] Found: the controller rewrite (a `\bfeature\.` substitution) also rewrote five
      `"../../feature.js"` import paths. → caught by grep before any test ran, and restored.

## Acceptance

- [x] AC-1 — `architecture.test.ts` › "has no module-scope router, feature or middleware
      construction": failed with 18 offenders before, passes after
- [x] AC-2 — every `index.ts` exports factories and builders only; `server.ts` calls nine
      `create*Router()` at mount and imports analytics through `analytics/index.js`
- [x] AC-3 — see Phase 0 and Phase 3: 9 failures on `dev`, 0 after, same experiment
- [x] AC-4 — a probe file with four banned forms: `eslint` exit 1, all four reported; its `public.js`
      and own relative `./feature.js` imports not reported. `npm run lint` on the real tree exit 0.
      Probe deleted
- [x] AC-5 — `npm test` exit 0 (unit 602/602; integration 196 passed, 5 skipped); integration 5 runs
      in a row, all exit 0 with identical counts; `docs:openapi:check` exit 0, spec unchanged;
      `contract:local:gate` exit 0, **Selected 37/46, Seed 42, 1371 generated / 1371 passed**, and
      the same 2 + 3 warnings the backlog already records
- [x] AC-6 — ADR-0045 added and registered; status note and back-link on ADR-0044; `architecture.md`,
      `api-design.md`, `feature-slice-ddd.md`, the new-feature skill, `ddd-inspector`, all five
      `public.ts` comments; ADR counts to 45 and the next free number to ADR-0046

## Gates

Commands and conditions live in `.claude/rules/workflow.md` § Gates are named, not asserted.

- [x] typecheck — exit 0
- [x] lint — exit 0 (after the docs edits too)
- [x] format — exit 0
- [x] tests — exit 0; integration 5 runs in a row exit 0
- [x] build — exit 0
- [x] OpenAPI — exit 0, no diff
- [x] contract gate — exit 0, 37/46 selected at seed 42
- [ ] security delta — skipped: no dependency change

## Review

- **Outcome:** importing any feature module constructs nothing; `server.ts` is the one place
  routers are built. The failure the todo described is gone rather than routed around: the same
  experiment goes from 9 failures to 0.
- **Plan vs result:** the todo scoped routers only; the real hazard also lived in 8 controller
  slots and `authMiddleware`. Found in planning, before code.
- **Guards added, each seen failing first:** the architecture test (18 offenders on `dev`) and the
  sibling composition-root lint rule (probe file).
- **Kept by choice:** `public.ts` (user decision) and the association freeze (ADR-0044 decision 4).
- **Follow-ups filed:** feature injection into router factories (also removes `server.ts`'s use of a
  test hook) and the metric → analytics trends coupling.
