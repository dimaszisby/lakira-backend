# Environment Configuration Review

## Scope

- Audit the current environment configuration flow that powers runtime configuration, type validation, and Sequelize config generation.
- Highlight strengths, risks, and actionable recommendations to align with production-grade backend expectations.

## System Overview

1. `src/config/loadEnv.ts` loads layered `.env` files with `dotenv`, honoring `NODE_ENV` and preserving pre-set variables.
2. `src/config/zodEnv.ts` imports `loadEnv`, builds a comprehensive `z.object` schema, and parses `process.env` into a typed `env` export.
3. `src/config/config.cjs` (Sequelize CLI format) imports the compiled `dist/config/envManager.js`, ensuring the CLI path shares the same validated env object as runtime consumers.
4. Runtime modules import the generated configuration or reuse the `env` export for feature toggles, rate limits, Redis, etc.
5. Test suites can wrap overrides with `withTestEnv` (`src/tests/env-test-utils.ts`), which snapshots `process.env`, resets the cache, and restores values; as of 2026-01-05 the ESLint override (`no-restricted-properties`) enforces using this helper instead of mutating `process.env` directly.
6. Legacy suites still need documentation/formatting polish while adopting the helper; a follow-up ticket (TKT-005A) tracks ongoing cleanup (see `legacy-test-cleanup.md`), but CI now fails fast if any test attempts to touch `process.env`.

## Strengths

- **Layered loading order** mirrors Vercel/Next.js semantics, which reduces surprise for engineers accustomed to that precedence model.
- **Strict validation**: The Zod schema enforces types (ports, booleans, enums) and surfaces clear errors for required DB credentials, reducing "works on my machine" drift.
- **Centralized typing**: `zodEnv.ts` acts as a single source of truth for configuration contracts.
- **Structured failure logging**: `envManager` emits JSON payloads with masked env samples and Zod issues, giving operators actionable diagnostics without leaking secrets.

## Identified Gaps

| Area                      | Finding                                                                                                                                         | Impact                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Build artifact dependency | `config.cjs` now requires the compiled `dist/config/envManager.js`; running migrations before `npm run build` surfaces module-not-found errors. | Developers must build before using Sequelize CLI; CI/CD must ensure build artifacts exist wherever migrations run. |
| Error reporting           | Wrapper error hides stack/context; stdout from the inline module is lost after serialization.                                                   | Operators lack actionable diagnostics when validation fails, slowing incident response.                            |
| Cache lifecycle           | Validation runs each time `config.cjs` is required (often multiple times per process).                                                          | Wasteful CPU during tests/migrations; complicates mocking or injecting overrides.                                  |
| Secret surface area       | JSON-stringifying the entire env object in a subprocess exposes secrets to any process monitor collecting stdout/stderr.                        | Increased blast radius if logs are captured or commands are audited.                                               |
| Testing ergonomics        | No helper to build partial envs or to stub values during unit/integration tests.                                                                | Encourages ad-hoc `process.env` mutation and increases flakiness.                                                  |

## Recommendations

1. **Adopt an in-process bootstrap**
   - Register `ts-node` (or build `zodEnv.ts` to plain JS) during CLI startup instead of spawning `execFileSync`.
   - Export a `loadEnvOrExit()` helper that caches the validated object and reuses it across modules.
2. **Structured error handling**
   - Include `cause` when rethrowing errors and log the failed file name and validation issues.
   - Emit actionable remediation hints (e.g., "Set TEST_DATABASE_URL in .env.test").
3. **Secret-aware logging**
   - Sanitize sensitive keys before printing or logging validation output.
4. **Testing utilities**
   - Provide `withTestEnv(overrides, fn)` that clones the parsed env, applies overrides, and restores globals after execution.
5. **Documentation & runbooks**
   - Document the expected `.env.*` files, required secrets per environment, and CI/CD provisioning (Vault, SSM, etc.).
   - Include troubleshooting steps for common validation failures.
6. **Sequelize integration**
   - Consider exporting a plain JS `sequelize-config.js` that requires the cached env and avoids `execFileSync`.

## Proposed Implementation Plan

1. **Refactor bootstrap**
   - Compile `zodEnv.ts` alongside the rest of the codebase and import it directly from `config.cjs`.
   - Introduce `src/config/env.ts` that lazily loads and caches the validated object.
2. **Enhance error surfaces**
   - Add a structured error class (e.g., `EnvValidationError`) that carries `issues` from Zod.
   - Update logging to include environment name, missing keys, and suggestions.
3. **Test tooling**
   - Add Jest helpers to mock env subsets without mutating global state permanently.
4. **Security posture**
   - Review whether secrets should be read from parameter stores rather than `.env` in production; document the target state.

## Next Steps

- Share this review with the platform/infrastructure lead.
- Prioritize the bootstrap refactor in the next sprint; target adding measurement to compare cold-start timings before/after.
- Update onboarding docs to link to this review and explain the desired env validation workflow.
