# Codex Prompt – Lakira Backend Test Structure Overhaul

You can paste the text below directly into Codex.

---

**Prompt for Codex**

> **Context**  
> I’m working on the Lakira Backend (Express + TypeScript + Sequelize + Postgres).  
> We’re about to clean up and standardize the backend test structure (unit vs integration vs contract/E2E).
>
> I’ve written a design/problem statement in this document:
>
> - `docs/tests/test-structure-concern.md`
>
> There are also related docs you may need:
>
> - `docs/tests/**` (1-static-checks, 2-unit-tests, 3-integration-tests, 4-contract-tests)
> - `docs/ci-cd/backend/**` (CI/CD strategy, backend-ci workflow plan/guidelines)
> - `docs/internal/initiatives/feature-vertical-slice-migration/**` (test overhaul plan/checklist if present)
> - Any Jest/Vitest config and `package.json` scripts for testing
> - The current test tree under `__tests__/` and relevant `src/features/**` code
>
> _Update (2026-01-09): The legacy `__tests__/analytics/**` folder referenced in older docs has now been merged into `__tests__/unit/features/analytics/**`. Treat any remaining mentions as historical context._ > **High-level goal**
>
> - Validate and refine the plan in `test-structure-concern.md` using real repo context.
> - Classify every existing test file by type (unit vs integration).
> - Propose concrete moves and config changes.
> - Generate a `plan.md`, `checklist.md`, and `ticket.md` I can use to execute this refactor step-by-step.
>
> Please **do not directly modify existing code or configs**. Instead, generate new/updated markdown docs and code snippets I can review and apply via PR.
>
> ---
>
> ### 1. Understand & validate the test strategy
>
> 1. Read `docs/tests/test-structure-concern.md` carefully.
> 2. Compare the **test type definitions** in Section 3 (static, unit, integration, contract) with how tests are actually written in the repo:
>    - Look at `__tests__/` tree and representative test files in:
>      - `__tests__/unit/features/analytics/**` (legacy references may still mention `__tests__/analytics/**`)
>      - `__tests__/docs/swagger.test.ts`
>      - `__tests__/features/**`
>      - Root `__tests__/*.test.ts`
>    - Check how the tests interact with:
>      - Sequelize models / test DB
>      - Express / HTTP (e.g., supertest)
>      - External dependencies (Redis, etc. if any)
> 3. In your response:
>    - Confirm which parts of the definitions are accurate.
>    - Call out any places where the document’s assumptions are wrong or incomplete (e.g., a “domain” test that actually hits DB, or an “application” test that is pure and should be considered unit).
>
> ---
>
> ### 2. Per-file classification (unit vs integration)
>
> For **every test file** under `__tests__/`, classify it as `unit` or `integration` based on real dependencies (DB/HTTP/etc).
>
> 1. Produce a new markdown document:
>    - `docs/internal/archive/test-classification-2025-12-22.md`
> 2. In that doc, create a table like:
>
>    ```markdown
>    | Test File Path                                        | Type        | Notes                            |
>    | ----------------------------------------------------- | ----------- | -------------------------------- |
>    | **tests**/features/auth/domain/AuthUser.test.ts       | unit        | Pure domain, no DB/HTTP          |
>    | **tests**/features/auth/application/LoginUser.test.ts | integration | Uses real repo & DB (Sequelize)  |
>    | **tests**/docs/swagger.test.ts                        | integration | Starts app and validates OpenAPI |
>    | ...                                                   | ...         | ...                              |
>    ```
>
> 3. Use the **actual code** to decide type, not just folder names:
>    - If it touches a real Sequelize instance / DB, treat as integration.
>    - If it spins up the Express app / uses supertest, treat as integration.
>    - If it’s pure in-memory logic with fakes/mocks, treat as unit.
> 4. At the end of that doc, add a short summary:
>    - Count of unit vs integration tests.
>    - Any surprising patterns (e.g., no unit tests for a particular feature).
>
> ---
>
> ### 3. Proposed folder moves (unit vs integration)
>
> Using the classification above and the target structure from `test-structure-concern.md`, propose explicit before/after moves.
>
> 1. Create another doc:
>    - `docs/internal/archive/test-structure-move-plan-2025-12-22.md`
> 2. In that doc, create sections:
>
>    **3.1 Unit tests – moves**
>    - List all files that should end up under `__tests__/unit/**`, in a table:
>
>      ```markdown
>      | From Path                                       | To Path                                                         |
>      | ----------------------------------------------- | --------------------------------------------------------------- |
>      | **tests**/features/auth/domain/AuthUser.test.ts | **tests**/unit/features/auth/domain/AuthUser.test.ts            |
>      | **tests**/analytics/fallback-range.test.ts      | **tests**/unit/features/analytics/domain/fallback-range.test.ts |
>      | ...                                             | ...                                                             |
>      ```
>
>    **3.2 Integration tests – moves**
>    - Same idea, but for `__tests__/integration/**`, including:
>      - features/\*/application
>      - features/\*/infrastructure/\*\*
>      - docs/swagger
>      - root `analytics.test.ts`, `auth.test.ts`, `metric*.test.ts`, etc.
>
> 3. If any move is **non-trivial** (e.g., relative imports breaking), add a “Notes / required changes” column with what needs to be fixed.
>
> ---
>
> ### 4. Tooling & config recommendations (tests & coverage)
>
> Based on the actual repo setup:
>
> 1. Inspect:
>    - `package.json` test scripts
>    - Jest/Vitest config files (e.g. `jest.config.*`, `vitest.config.*`)
>    - Any existing coverage setup
> 2. Create another doc:
>    - `docs/internal/archive/test-tooling-recommendations-2025-12-22.md`
> 3. In that doc:
>    - Show the **current** testing/coverage related scripts and config (brief summary).
>    - Propose concrete updated snippets for:
>      - `package.json`:
>        - `test`
>        - `test:unit`
>        - `test:integration`
>        - `test:contract:local`
>        - `test:contract:staging`
>      - Jest/Vitest config:
>        - How to run **only unit** tests (using `__tests__/unit/**` or suffixes).
>        - How to run **only integration** tests (using `__tests__/integration/**`).
>        - `collectCoverageFrom`, `coverageDirectory`, and reasonable `coverageThreshold` defaults.
>    - Show these as **ready-to-paste code blocks**, but do not modify files directly.
>
> ---
>
> ### 5. Generate plan.md, checklist.md, and ticket.md
>
> Finally, I want three “driver” docs that I can use to actually execute this refactor.
>
> Please create under `docs/internal/initiatives/tests-overhaul/` (create the folder if needed):
>
> 1. `docs/internal/initiatives/tests-overhaul/test-structure-plan.md`
>    - High-level narrative plan with sections:
>      - Context & goals (short summary referencing `test-structure-concern.md`).
>      - Definitions of test types (static, unit, integration, contract) — concise version.
>      - Phases:
>        - Phase 0: Confirm definitions & classification.
>        - Phase 1: Create `unit/` and `integration/` dirs + perform initial moves.
>        - Phase 2: Tighten application tests (optional splitting into pure unit + integration).
>        - Phase 3: Update docs (`docs/tests/**`) and coverage config.
>        - Phase 4: Align CI (backend-ci workflow, scripts).
>      - Risks / trade-offs / rollback strategy (if any).
> 2. `docs/internal/initiatives/tests-overhaul/test-structure-checklist.md`
>    - A **detailed, actionable checklist** I can tick off, grouped by phase.
>    - Each item should be small and concrete, e.g.:
>      - `[ ] Move __tests__/features/auth/domain/AuthUser.test.ts → __tests__/unit/features/auth/domain/AuthUser.test.ts`
>      - `[ ] Update package.json test scripts to match recommended values`
>      - `[ ] Run npm run test:unit && npm run test:integration locally`
>      - `[ ] Update docs/internal/initiatives/tests-2-unit-tests/README.md to mention new layout`
> 3. `docs/internal/initiatives/tests-overhaul/test-structure-ticket.md`
>    - A “single issue” style ticket body, suitable for GitHub/Jira, including:
>      - Title, summary, background.
>      - Acceptance criteria (e.g., “unit tests live under **tests**/unit/**, integration under **tests**/integration/**, CI jobs wired to test:unit / test:integration, all tests passing”).
>      - Out-of-scope notes, if any.
>
> Please make these three docs **consistent** with each other and with the earlier classification/move-plan documents.
>
> ---
>
> ### 6. Output format
>
> In your final response to me:
>
> - Summarize what you created (file list + short description per file).
> - Include inline snippets for the most important parts (e.g., package.json scripts, key sections of plan/checklist/ticket).
> - Make it clear where I should look first when I open VSCode (e.g., “start with test-classification-2025-12-22.md, then test-structure-move-plan-2025-12-22.md”).
>
> Don’t actually apply the file moves or change code/config in this run — only generate the docs and snippets.
