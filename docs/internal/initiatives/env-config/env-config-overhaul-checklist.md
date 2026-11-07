# Environment Configuration Overhaul Checklist

> Use this checklist to track the delivery of the overhaul plan. Each item should be checked only after code, docs, and tests are merged.

## Phase 1 — Foundations

- [x] Ensure `src/config/zodEnv.ts` is compiled in the build output (update `tsconfig.build.json` if required).
- [x] Create `src/config/envManager.ts` exporting `loadEnvOrExit`, `getEnv`, and caching logic.
- [x] Replace `execFileSync` usage in `src/config/config.cjs` with a direct import of the compiled env manager.
- [ ] Verify `npm run build` and `sequelize db:migrate` no longer spawn child Node processes.

## Phase 2 — Error & Security Hardening

- [x] Introduce `EnvValidationError` carrying Zod issues and remediation hints.
- [x] Add secret masking utility that redacts keys such as `*_SECRET`, `*_PASSWORD`, `API_KEY`, etc.
- [x] Emit structured logs (JSON) for validation failures, including environment name and hint, but no secret values.
- [x] Add regression tests covering masked logging and error surfaces.

## Phase 3 — Tooling & Testing

- [x] Implement `withTestEnv` / `mockEnv` helpers that snapshot and restore configuration.
- [x] Update at least one integration test to rely on the helper instead of mutating `process.env` directly.
- [x] Introduce ESLint/Jest rules or scripts that flag direct `process.env` usage in tests.
- [x] Document the helper usage in the testing guide or README section.
- [ ] Migrate legacy test suites off direct `process.env` usage so lint can run clean (Jest globals override in place; helper adoption pending, see `legacy-test-cleanup.md`).

## Phase 4 — Documentation & Runbooks

- [ ] Author `.env` precedence and required variable matrix in `docs/internal/initiatives/env-config`.
- [ ] Document secret provisioning strategy for staging/production (Vault/SSM/KMS) and link runbooks.
- [ ] Create troubleshooting FAQ covering missing files, invalid values, and recovery steps.
- [ ] Update onboarding docs to reference the new env workflow and tooling.

## Phase 5 — Production Validation

- [ ] Add feature flag/fallback path allowing reversion to legacy loader in case of incident.
- [ ] Capture and compare cold-start metrics before/after rollout in non-prod.
- [ ] Instrument monitoring/alerting for env validation errors and expose a dashboard.
- [ ] Execute staged rollout (dev → staging → prod) with sign-offs from Platform and SRE.

## Governance

- [ ] Link this checklist to the project/epic tracker and keep status in sync.
- [ ] Assign owners for each phase and capture review sign-offs (Security, DevEx, SRE).
- [ ] Archive artifacts (design docs, incident postmortems, metrics) in the env-config folder once rollout completes.
