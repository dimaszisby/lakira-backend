# ADR-0033 — Centralize analytics env reads through `envManager`

- **Status:** Accepted
- **Date:** 2026-05-21
- **Amended:** 2026-10-09, by [`deterministic-query-ordering` D-06](../../internal/initiatives/deterministic-query-ordering/decisions.md). Two of the seven variables below, `VIZ_CACHE_MAX_AGE_SEC` and `VIZ_CACHE_STALE_SEC`, were removed: both analytics routes now send `Cache-Control: private, no-cache`. The decision to read the other five through `envManager` stands.
- **Origin:** `ADR-004` in the Observability kit — [`observability`](../../internal/initiatives/observability/decisions.md)

---

## Context

The 2026-05-20 re-audit (`docs/internal/audits/saas-readiness/audit-2026-05-20.md` § [P1-4.2]) flagged six analytics files still reading `process.env.VIZ_*` and `process.env.DEFAULT_TZ` directly with inline `Number(...) ?? <default>` fallbacks. This bypassed the Zod-validated singleton (`src/config/envManager.ts`) — defaults were duplicated at every call site, types were `string | undefined` instead of parsed numbers, and the values escaped the masked snapshot / validation flow used everywhere else. It was the single P1 keeping Category 4 (Security) below the 80% bar required by ADR-001's fork-ready exit criteria.

## Decision

Add seven entries to `src/config/zodEnv.ts` under a new "Analytics / Visualization" section — `VIZ_MAX_BUCKETS` (400), `VIZ_DASH_MAX_METRICS` (24), `VIZ_DEFAULT_TTL_SEC` (120), `VIZ_CACHE_MAX_AGE_SEC` (60), `VIZ_CACHE_STALE_SEC` (30), `VIZ_FALLBACK_GUARD_BUCKETS` (96), and `DEFAULT_TZ` ("Asia/Jakarta"). Numerics use `z.coerce.number().int().positive().default(...)`; `DEFAULT_TZ` uses `z.string().default(...)`. Route all six analytics call sites through `envManager`: `GetDashboardVisualization.ts` calls `loadEnvOrExit()` inside `execute()` (required so the existing `withTestEnv` unit test can override `VIZ_DASH_MAX_METRICS` at runtime — the module-level `env` singleton in `envManager.ts:114` snapshots at first import and ignores `resetEnvCacheForTesting()`); the remaining five files import the `env` singleton at module top. Defaults preserve the previous inline fallbacks exactly, so runtime behaviour is unchanged.

## Options considered

- _Leave the inline `process.env` reads in place._ Rejected: violates `.claude/rules/environment.md` ("All environment access goes through `loadEnvOrExit()`"); duplicates defaults across files; the gap was already audited.
- _Introduce a dedicated `AnalyticsConfig` object built once at module load._ Rejected as premature: a flat `env.X` lookup is what every other feature in the repo does (rate limits, TTLs, etc.). An extra indirection would add no validation and one more import.
- _Make the vars required (no defaults)._ Rejected: the inline `?? <n>` fallbacks were the de-facto contract; promoting them to required would break every existing `.env` file without warning. Defaults match the prior values exactly.

## Consequences

- All seven knobs are validated at boot — bad inputs fail fast with a Zod error instead of producing `NaN` deep inside cache TTL math.
- `.env.example` documents the new section (commented-out defaults, matching the existing format).
- `grep -rn 'process\.env\.' src/features/public/analytics/` is now zero — the file boundary becomes part of the contract.
- Cat 4 in the audit moves from 62.5% to 75%; closes 1 of the remaining 4 P1 gaps.

**Follow-ups (open, non-blocking):**

- Align the five `env`-singleton call sites with `.claude/rules/environment.md` — "Use in code via `const env = loadEnvOrExit(); env.YOUR_VAR`". Files: `GetVisualization.ts`, `VisualizationCacheRedis.ts`, `schema.zod.ts` (the module-top `MAX_BUCKETS` / `DEFAULT_TZ` consts feed Zod schema definitions evaluated at import time — likely needs `.default(() => loadEnvOrExit().DEFAULT_TZ)` and moving the `MAX_BUCKETS` read inside `validateRelativeWindow`), `controller.ts`, `VisualizationReadRepoSequelize.ts`. P1-4.2 audit criterion is already satisfied (zero direct `process.env.*` reads in analytics); this is a project-rule compliance item, not an audit gap. Severity: P3 quality. Risk if deferred: future unit tests on these files that use `withTestEnv` will silently fail to override (the singleton snapshots at first import).

## Links

- `docs/internal/audits/saas-readiness/audit-2026-05-20.md` § [P1-4.2]
- `.claude/rules/environment.md` (project pattern reference for the follow-up)
- `src/config/zodEnv.ts` (Analytics / Visualization section)
- `src/features/public/analytics/**` (six call sites)
