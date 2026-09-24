# Environment Configuration Overhaul Plan

## Objective

Transform the current environment configuration pipeline into an industry-standard, production-grade system with predictable bootstrapping, hardened security, and developer-friendly tooling.

## Guiding Principles

- **Single Source of Truth**: Validation and runtime access share the same hydrated object.
- **Fail Fast with Context**: Misconfigurations halt boot with actionable diagnostics.
- **Security by Default**: Secrets are never logged, and `.env` files are optional in higher environments.
- **Developer Ergonomics**: Tests and scripts can inject configuration overrides safely.

## Current Pain Points (Summary)

1. CLI bootstrap spawns `ts-node` via `execFileSync`, which is brittle and slow.
2. Validation results are not cached, leading to repeat work per import.
3. Error messages obscure Zod issues and expose sensitive data via JSON serialization.
4. Lack of test helpers pushes engineers to mutate `process.env` ad hoc.
5. No runbooks documenting required env files or secret provisioning.

## Target Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  .env sources  ──>  loadEnv.ts (layered loader)               │
│                             │                                │
│                             ▼                                │
│                 zodEnv.ts ⇢ envManager.ts                     │
│                             │    ▲                           │
│                             ▼    │                           │
│                      Runtime modules   sequelize-config.mjs   │
└──────────────────────────────────────────────────────────────┘
```

- `envManager.ts` exports `loadEnvOrExit()` that caches validated results, exposes typed getters, and provides helper utilities (masking, overrides).
- Sequelize CLI loads a precompiled JS module instead of running inline TS.

## Implementation Phases

### Phase 1 — Foundations

- **Action**: Compile `src/config/zodEnv.ts` to JS as part of the build (ensure `tsconfig.build.json` includes it) and create `src/config/envManager.ts`.
- **Deliverables**:
  - `envManager.ts` with `loadEnvOrExit()`, `getEnv(key)`, and caching.
  - Replace `execFileSync` in `src/config/config.cjs` with a direct `require` of the compiled manager.
- **Success Metrics**: `npm run build` + `sequelize db:migrate` run without spawning child Node processes.
- **Status**: `src/config/config.cjs` now imports `dist/config/envManager.js`, reusing the cached loader.

### Phase 2 — Error & Security Hardening

- **Action**: Introduce `EnvValidationError` capturing Zod issues and add structured logging (include environment, missing keys, remediation hint, no secret values).
- **Deliverables**:
  - Masking utility (e.g., hide `*_SECRET`, `*_PASSWORD`).
  - Logging hooks that emit JSON payloads to observability stack.
- **Success Metrics**: Simulated invalid env fails with descriptive, secret-safe output.
- **Status**: Env manager now throws `EnvValidationError`, masks sensitive keys, and logs structured payloads.

### Phase 3 — Tooling & Testing

- **Action**: Build helpers for test suites (`withTestEnv`, `mockEnv`) that clone cached config and restore it after usage.
- **Deliverables**:
  - Jest utility in `__tests__/utils/env.ts` (or similar) + documentation snippet.
  - Example tests migrated to the helper.
- **Success Metrics**: New helper adopted in at least one integration test; lint rules prevent direct mutation of `process.env` in tests.
- **Status**: Helper published (`src/tests/env-test-utils.ts`), analytics tests migrated, and as of 2026-01-05 the ESLint override blocks direct `process.env` usage in `__tests__/**`.
- **Follow-up**: In progress: Continue migrating legacy suites to `withTestEnv` patterns per TKT-005A (formatting/fixture cleanup) even though the guardrail now prevents regressions.

### Phase 4 — Documentation & Runbooks

- **Action**: Expand `docs/internal/initiatives/env-config` with:
  - `.env.*` precedence guide and expected variables per environment.
  - Secret provisioning strategy (Vault/SSM/KMS) for staging/production.
  - Troubleshooting FAQ and escalation checklist.
- **Deliverables**: Updated review doc references, onboarding guide link, runbook for failed env validation alerts.
- **Success Metrics**: Onboarding doc references the new flow; runbook consumed by platform team.

### Phase 5 — Production Validation

- **Action**: Roll out to non-prod, capture cold-start metrics, and monitor logging/alerts.
- **Deliverables**:
  - Feature flag or toggle to fall back to legacy loader if issues arise.
  - Observability dashboard tracking env validation failures.
- **Success Metrics**: No increase in startup time; validation errors drop in frequency due to improved ergonomics.

## Risks & Mitigations

| Risk                                                        | Mitigation                                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Breaking migrations because Sequelize CLI still expects CJS | Publish a JS shim (`sequelize-config.js`) that reuses `envManager` and update package scripts gradually. |
| Tests relying on implicit `process.env` side effects        | Provide codemods/examples and run lint checks (`no-process-env`) to guide adoption.                      |
| Secrets leaking in custom logging                           | Enforce masking utility at the logger level; add unit tests to verify masked output.                     |
| Rollout regressions in production                           | Use canary deploy, enable feature flag fallback, and monitor errors via APM dashboards.                  |

## Timeline (High-Level)

| Week | Milestone                                      |
| ---- | ---------------------------------------------- |
| 1    | Phase 1 PR merged, caching in place            |
| 2    | Error/security hardening completed             |
| 3    | Test utilities + documentation drafted         |
| 4    | Production rollout, monitoring instrumentation |

## Ownership & Follow-up

- **Primary**: Backend Platform squad
- **Reviewers**: Security, DevEx, SRE
- **Artifacts**: Link this plan in `README`, create tracking epic in project management tool, reference tasks per phase.

## Appendix: Acceptance Criteria

1. `loadEnvOrExit()` is the only entry point to env data.
2. `npm run build`, migrations, and Jest all use the cached env.
3. Invalid configuration surfaces actionable errors without leaking secrets.
4. New documentation describes boot order, overrides, and recovery steps.
