# Unit Tests Decision Log

## UT-ADR-001 - Multi-Project Jest & Env Strategy (Accepted 2025-02-26)

- **Context:** After the test-structure overhaul, Jest already supported multiple projects, but documentation never confirmed how the unit stage avoids heavy DB/bootstrap work.
- **Decision:** Keep the dedicated `unit` project in `jest.config.mjs`, run it via `npm run test:unit`, and enforce `SKIP_DB_LIFECYCLE=true` with `withTestEnv` inside `jest.setup.unit.ts`. This guarantees unit suites always run in-memory while integration suites continue using `jest.setup.ts`.
- **Consequences:** Contributors have a predictable entry point for TDD, CI can parallelize stages, and runtime remains under 30 s locally. Future helpers (factories, builders) should align with the same setup file so they inherit env overrides automatically.
- **References:** `jest.config.mjs`, `jest.setup.unit.ts`, `package.json` scripts, `docs/internal/initiatives/tests-2-unit-tests/README.md`.

## UT-ADR-002 - Coverage Posture & Artifact Flow (Accepted 2025-02-26, superseded 2026-01-09)

- **Context:** Coverage is currently ~45% statements, and `jest.config.mjs` keeps global thresholds at `0` to avoid blocking CI while gaps exist. GitHub Actions moves coverage output (`coverage/jest` -> `coverage/jest-unit`) but no documentation tied the behavior back to the unit-test strategy.
- **Decision:** Track coverage improvements via `metrics-tracker.md` and the checklist while keeping Jest thresholds at `0` until Phase 2 closes the major gaps (metric settings, caches, middleware). Once >= 60% statements is achieved, raise thresholds and capture the follow-up ADR.
- **Consequences:** CI remains green while we build coverage, yet there is a documented path (plan + checklist) to tighten enforcement. Reviewers can still inspect coverage artifacts uploaded from the `tests` job.
- **Update (2026-01-09):** Superseded by UT-ADR-004 after the suite surpassed the ≥ 60 % goal; thresholds are now enforced and JUnit artifacts accompany coverage output.
- **References:** `.github/workflows/backend-ci.yml`, `metrics-tracker.md`, `unit-tests-plan.md`, `unit-tests-checklist.md`.

## UT-ADR-003 - Shared Factory Strategy (Accepted 2025-12-30)

- **Context:** As coverage expands into metric settings and other complex domains, tests were repeatedly re-declaring large DTOs/entities, making fixtures inconsistent and hard to update.
- **Decision:** Introduce deterministic builders under `__tests__/unit/factories/**` (starting with `metric-settings.ts`) and reference them in README/workflow docs. Factories encapsulate default props and make it trivial to override targeted fields per spec.
- **Consequences:** Suites stay focused on behavior instead of plumbing; adding new builders becomes the default approach for other domains. Future pull requests should extend this folder instead of copying JSON blobs directly into tests.
- **References:** `__tests__/unit/factories/metric-settings.ts`, `docs/internal/initiatives/tests-2-unit-tests/README.md`, `WORKFLOW_GUIDELINES.md`.

## UT-ADR-004 - Enforce Coverage Thresholds & Publish JUnit Artifacts (Accepted 2026-01-09)

- **Context:** Phase 2 lifted coverage to 68 % statements / 49 % branches, meeting the targets outlined in UT-ADR-002. CI still relied on optional coverage runs and offered no structured test report artifacts beyond raw coverage folders.
- **Decision:** Raise Jest global thresholds to ≥ 60 % statements, ≥ 40 % branches, ≥ 55 % functions, and ≥ 60 % lines, and add `jest-junit` so every `npm run test:unit` execution uploads `coverage/junit/unit.xml` in addition to `coverage/jest-unit`.
- **Consequences:** Any coverage regression now fails the pipeline immediately, and reviewers/QA have deterministic XML artifacts for dashboards or future tooling integrations. Contributors must update or justify coverage when touching critical paths.
- **References:** `jest.config.mjs`, `package.json` (jest-junit dependency), `docs/internal/initiatives/tests-2-unit-tests/README.md`, `docs/internal/initiatives/tests-2-unit-tests/WORKFLOW_GUIDELINES.md`, `docs/how-to/ci-cd/daily-pipeline-playbook.md`.
