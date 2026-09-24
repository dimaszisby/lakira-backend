# ADR-0024 — APP_NAME centralization strategy

- **Status:** Accepted (2026-09-24 — implementation verified in code; see the status note)
- **Date:** 2026-05-03
- **Origin:** `ADR-001` in the Forkability kit — [`forkability`](../../internal/initiatives/forkability/decisions.md)

> **Status note (2026-09-24).** Moved from Proposed by the `docs-sweep` kit
> ([D-03](../../internal/initiatives/docs-sweep/decisions.md)): the decision below is in the code.
> Evidence: `src/config/app-name.ts` exports `APP_NAME` (default `"lakira-backend"`) and every
> runtime reference imports it; `scripts/bootstrap-fork.sh` rewrites the build-time references.

---

## Context

The audit identified ~13 files containing the literal string `lakira`. Forkers must find-and-replace all of them manually. The forkability plan centralizes the runtime references into a single `src/config/app-name.ts` constant, but build/config files (`package.json`, CI workflows, Docker Compose) cannot import TypeScript at build time.

## Decision

1. Runtime references (`.ts` files) read from `APP_NAME` exported by `src/config/app-name.ts`, which reads `process.env.APP_NAME` with a default of `"lakira-backend"`.
2. Build-time references (`package.json`, `docker-compose.test.yml`, CI YAML) are handled by the `scripts/bootstrap-fork.sh` sed-replacement script — not centralized at runtime.
3. The bootstrap script is the canonical entry point for forkers; `README.md` documents it.

## Options considered

- _Environment variable only (no TS constant)._ Rejected: runtime code would need `process.env.APP_NAME ?? "lakira-backend"` scattered across files, defeating the point.
- _Build-time code generation (template engine)._ Rejected: overengineered for ~8 sed replacements in static config files.

## Consequences

- Adding a new branded file requires updating both `app-name.ts` imports (if runtime) and `bootstrap-fork.sh` (if build-time).
- Forkers who skip the script must manually edit the build-time files.

## Links

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md` § 11.3, 11.4
- `forkability-plan.md` § Phase A, Phase B
