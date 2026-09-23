# Todo — the feature-boundary rule stops at `src/features/`

- **Status:** Open
- **Created:** 2026-09-22
- **Owner:** unassigned
- **Origin:** discovered implementing the `feature-boundaries` kit (PR 1); see its checklist
  § Discovered

---

## What

The `no-restricted-imports` boundary rule added in `eslint.config.mjs` applies to
`src/features/**/*.ts`. **Code outside the feature tree can still reach into a feature's
internals**, and does.

Widening the rule to `src/**/*.ts` was tried and reverted. It reports **33 violations across 8
files**:

| File                                 | Nature                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `src/infrastructure/db/models.ts`    | **Structural** — the barrel's job is importing every feature's models  |
| `src/infrastructure/db/types.ts`     | **Structural** — same, for their types                                 |
| `src/types/domain/metric.domain.ts`  | Global type file referencing feature types                             |
| `src/types/dtos/metric.dto.ts`       | Same                                                                   |
| `src/lib/openapi/openapi-schemas.ts` | Spec generation reaching feature Zod schemas                           |
| `src/utils/db-helper.ts`             | Unclear — needs a look                                                 |
| `src/worker.ts`                      | **Genuine violation** — reaches metric-log internals for its consumers |
| `src/server.ts`                      | Mostly clean (uses `index.js`), a few deep imports remain              |

## Why it was not fixed in PR 1

It more than doubles the measured scope. The kit was sized against 25 cross-feature imports plus 3
ORM violations, all inside `src/features/`. `.claude/rules/workflow.md` § Task Flow says to stop and
re-size when a discovery changes the shape of the work rather than carrying on under the lighter
plan — this is that.

It also is not one problem. `models.ts` importing every feature's Sequelize models is the composition
root doing its job and will never be a violation; `worker.ts` reaching into metric-log internals is a
real one. Fixing them together would require the rule to distinguish cases it currently cannot.

## What to decide

1. **Does the composition root get a blanket exemption?** `models.ts`, `types.ts` and `server.ts`
   are arguably where wiring is _supposed_ to happen. An exemption list is easy; the risk is it
   becomes the place violations hide.
2. **Should global type files under `src/types/` reference feature types at all?** If a DTO type
   lives outside the feature that owns it, the boundary is already crossed at the type level and the
   import is a symptom, not the disease.
3. **`worker.ts` is the clear-cut one** and could be fixed alone — it needs `MetricLogCacheRedis`,
   `MetricLogRepoSequelize` and `GenerateDummyMetricLogsHandler` exported from metric-log's
   `index.ts`, the same way PR 1 did for the other five features.

## Scope

`eslint.config.mjs` (widen `files:`, add whatever exemption is decided), plus the import rewrites
and `index.ts` exports that follow.

## Verification

`npx eslint src` must be clean, and the rule must be **seen to reject** a deliberate violation added
outside `src/features/` before it is trusted — the failure this whole kit exists to prevent.
