# Env Config Overhaul — Ticket Breakdown

> Use these tickets (or equivalent work items) to track execution. Link each ticket back to the checklist item it satisfies.

## TKT-001 — Build Output Coverage

- Ensure `src/config/zodEnv.ts` and supporting files are compiled in `npm run build`.
- Update `tsconfig.build.json` if new paths/globs are required.
- Definition of Done (DoD): `dist/config/zodEnv.js` exists and is imported by downstream modules without `ts-node`.

## TKT-002 — Env Manager Module

- Implement `src/config/envManager.ts` with `loadEnvOrExit`, caching, typed getters, and masking helper stubs.
- Unit tests verifying caching behavior and idempotency.
- DoD: All runtime modules import from env manager; `envManager` documented in README.

## TKT-003 — Sequelize Config Refactor

- Replace `execFileSync` usage in `src/config/config.cjs` with a direct import from `envManager`.
- Provide fallbacks or feature flag if legacy path must be temporarily supported.
- DoD: `sequelize db:migrate` runs without spawning child Node processes.
- Status: `src/config/config.cjs` now requires `dist/config/envManager.js` and shares the cached loader.

## TKT-004 — Structured Errors & Logging

- Introduce `EnvValidationError` capturing Zod issues and remediation guidance.
- Implement secret masking utility and structured JSON logging for failures.
- Regression tests verifying masked output and error shape.
- Status: Env manager now throws `EnvValidationError`, masks sensitive keys, and has Jest coverage for masking/caching behavior.

## TKT-005 — Test Utilities

- Deliver `withTestEnv` / `mockEnv` helper with documentation and examples.
- Update representative integration test to adopt the helper.
- Add lint/test rule that flags direct `process.env` mutation in tests.
- Status: Helper added, analytics tests migrated, and as of 2026-01-05 the ESLint override blocks direct `process.env` usage. Documentation lives in `docs/internal/initiatives/env-config/with-test-env-helper.md`. Follow-up ticket: TKT-005A to clean up legacy suites (formatting + helper adoption evidence).

## TKT-005A — Legacy Test Cleanup

- Scope: Update legacy `__tests__/**` suites to import Jest globals, use `withTestEnv` (or `getEnv`) instead of mutating `process.env`, and clear lingering lint errors. Details captured in `docs/internal/initiatives/env-config/legacy-test-cleanup.md`.
- Deliverables:
  - ESLint override providing Jest globals so rules don’t flag `describe`/`it`. (pass)
  - Guardrail enforcing `no-restricted-properties` for `process.env` within tests. Done (2026-01-05)
  - Incremental refactors (or TODO markers) for suites that still rely on manual env mutation / formatting drift.
- Success Metrics: `npm run lint:tests` passes without disabling the guardrail (achieved 2026-01-05); remaining work focuses on documentation and formatting cleanup.
- Status: In progress — Guardrail enforced; continue applying Prettier/refactors and tracking TODOs per the cleanup doc.

## TKT-006 — Documentation & Runbooks

- Produce `.env` precedence matrix, secret provisioning runbook, and troubleshooting FAQ.
- Update onboarding guide and link to review/plan/checklist.

## TKT-007 — Rollout & Monitoring

- Add feature flag/fallback for legacy loader.
- Instrument cold-start metrics and env validation alerting.
- Coordinate staged rollout (dev → staging → prod) with Platform/SRE sign-off.

## Governance

- Track dependencies between tickets (e.g., TKT-001 → TKT-002).
- Log owners, estimates, and status in the project/epic tracker.
- Archive results (metrics, retros, postmortems) in `docs/internal/initiatives/env-config` after completion.
