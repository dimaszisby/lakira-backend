# Feature boundaries — Checklist

## PR 1 — `fix/feature-boundaries`

### Phase 0 — Prove the negative

- [x] Violation set recorded on unchanged source: **14 to fix, 11 to freeze, 2 self-imports**
- [x] `npx eslint src/features` with the new rule reported **18** (15 boundary + 3 ORM) before any
      were fixed. The 16th (a self-import of a model) sits in an exempt file — see Review.

### Phase 1 — Public surfaces

- [x] `shared/auth/public.ts` — `authMiddleware`, `assertHasOrgRole`, `requireOrgRole`,
      `requireVerifiedEmail`
- [x] `public/metric/public.ts` — `MetricAccessSequelize`
- [x] `public/metric-category/public.ts` — `toMetricCategoryResponseDTO`, `toMetricCategoryDomain`,
      `MetricCategoryRow`
- [x] `public/metric-settings/public.ts` — `toMetricSettingsResponseDTO`, `toDomainMetricSettings`
- [x] `public/metric-log/public.ts` — `toMetricLogResponseDTO`, `toDomainMetricLog`
- [x] Each `index.ts` re-exports its `public.ts` so the composition root is unaffected

### Phase 2 — Rewrite the imports

- [x] 5 routers — `authMiddleware` via `@/features/auth/public.js`
- [x] 3 `feature.ts` — `MetricAccessSequelize` via `@/features/metric/public.js`
- [x] `metric/infrastructure/http/dto.ts` — 3 imports via siblings' `public.js`
- [x] `metric/…/mappers/MetricReadMapper.ts` — 3 mapper imports via siblings' `public.js`
- [x] `MetricReadMapper.ts:1` and `auth/…/http/controller.ts:8` — self-imports now relative

### Phase 3 — Dummy generators

- [x] `GenerateDummyMetrics.ts` — injects `MetricRepository` + `TransactionPort`; the batch now runs
      in one transaction, so a half-failed dummy run leaves nothing behind
- [x] `GenerateDummyMetricLogs.ts` — injects `MetricLogRepository`
- [x] `GenerateDummyMetricLogsHandler.ts` — injects `MetricLogRepository`; the `DbTransaction` type
      hack is gone (it existed only to avoid naming the ORM in the application layer)
- [x] `MetricLogRepository.create` takes an optional `tx`; `MetricLogRepoSequelize` threads it to
      both `create` and `reload`
- [x] DI updated in `metric/feature.ts`, `metric-log/feature.ts`, `src/worker.ts`
- [x] `GenerateDummyMetricLogs.test.ts` retargeted from the ORM mock onto the repository port —
      the `jest.mock("@/infrastructure/db/models.js")` block is gone

### Phase 4 — Rule and freeze

- [x] `eslint.config.mjs` — `LEGACY_IMPORT_PATTERNS` extracted so the new blocks cannot silently
      drop the legacy bans; three boundary blocks added
- [x] ORM ban on `src/features/*/*/application/**`
- [x] `architecture.test.ts` — count frozen at **11**, with a failure message naming D-02

### Phase 5 — Negative fixtures

- [x] Boundary rule — a deliberate deep import was added, reported, and removed; clean after
- [x] ORM rule — same, on `CreateMetric.ts`
- [x] Ratchet — a 12th model association was added; the test failed with
      `Cross-feature model associations moved from 11 to 12` and passed again on revert

## Discovered

- [x] Found: the boundary rule only covers the `src/features` tree. Widening it to all of `src`
      reports 33 violations across 8 files, several structural — `infrastructure/db/models.ts`
      exists to import every feature's models. → **out of scope**, filed as
      `docs/internal/todos/2026-09-22-todo-feature-boundary-rule-scope.md`. Reverted rather than
      carried, per workflow.md § Task Flow.
- [x] Found: **`index.ts` barrels construct routers at module scope**, producing a genuine circular
      import that broke nine tests. → **in scope** as [D-05](decisions.md) (`public.ts` per
      feature); the root-cause fix filed as
      `docs/internal/todos/2026-09-22-todo-routers-constructed-at-module-scope.md`.
- [x] Found: `@/features/<name>` bare aliases exist in `tsconfig.json` but do not resolve under
      `moduleResolution: NodeNext` — an explicit `/index.js` or `/public.js` is required.
      → **in scope**, all imports use the explicit form, matching `server.ts:21`.
- [x] Found: ESLint's `no-restricted-imports` accepts a `!negation` inside `group` but it has no
      effect on matching. → **in scope**; the model carve-out enumerates allowed paths positively.
- [x] Found: same-feature `application/ → infrastructure/` relative imports exist (e.g.
      `GenerateDummyMetrics` importing its own mapper) and no rule catches them. → **out of scope**;
      noted here, no separate todo, since the layering rule's intent is already recorded.

## Acceptance

- [x] AC-1 — `npx eslint src/features` reports 0 ORM violations; the rule was seen rejecting one
- [x] AC-2 — 14 cross-feature imports via `public.js`; both self-imports relative
- [x] AC-3 — exactly 11 model associations, asserted; a 12th was seen failing
- [x] AC-4 — all three rules demonstrated rejecting a deliberate violation and recovering
- [ ] AC-5 — PR 2
- [ ] AC-6 — PR 2

## Gates

- [x] typecheck — `npm run typecheck`, exit 0
- [x] lint — `npm run lint`, exit 0
- [x] format — `npm run format:check`, exit 0
- [x] tests — `test:unit` exit 0 (**588** passed, 91 suites); `test:integration` exit 0 (196 passed,
      5 skipped, 28 of 30). Run separately.
- [x] build — `npm run build`, exit 0
- [ ] OpenAPI — **skipped**, no route, Zod schema or `src/lib/openapi/**` change
- [ ] security delta — **skipped**, no dependency added, upgraded or removed

---

## Review

**Outcome.** Two of C4's three claims are closed. The boundary and ORM rules are enforced in ESLint,
the 11 model associations are frozen at an exact count, and every rule has been seen to reject.
`AppError` in domain is PR 2.

**The plan's central assumption was wrong, and finding out cost the most time.** It assumed routing
cross-feature imports through `index.ts` was simply doing what `architecture.md` already asked.
Doing that broke nine tests, because every barrel constructs its routers at module scope and so
pulls its whole composition root. The fix — a `public.ts` per feature — is [D-05](decisions.md), and
the root cause is filed separately. Two earlier decisions (D-02's freeze, D-05 itself) are both
workarounds for that single cause, which is worth knowing before either is treated as settled.

**What the negative fixtures were actually worth.** Three separate times, something looked right and
was not:

1. The first ESLint run reported **0 violations with exit 2** — the config had failed, not the code
   passed. A naive "no violations, good" would have shipped a rule that never ran.
2. The `!negation` in the model carve-out is accepted by ESLint and silently does nothing; the
   carve-out only worked once enumerated positively.
3. A `persistence/*` glob matched across path separators and re-banned the models it was meant to
   exempt.

None of these would have been caught by the rule passing. They were caught by insisting it fail
first. That is the whole content of C4.

**Scope held.** One discovery (the `src/**` gap) would have more than doubled the diff and was
reverted and filed rather than carried — the re-size rule working as intended.

**Unproven:** the ratchet's message is written for a human who breaks it, and I have only seen it in
my own terminal. Whether it actually reads as actionable to someone who hits it cold in CI is not
something this PR demonstrates.

## PR 2 — `refactor/feature-boundaries-errors`

Not started. See the plan's Phases § PR 2.
