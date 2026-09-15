# Findings

- **Status:** Superseded (verified 2026-09-15) — the `no-restricted-properties` env guardrail this
  asked for now exists at `eslint.config.mjs:128`. Kept as a record; no action outstanding.

- ESLint now lint checks `__tests__/**`, but documentation under `docs/internal/initiatives/env-config/**` still claims a `no-restricted-properties`/`no-process-env` guardrail exists even though `eslint.config.mjs` never enforces it. This gap can confuse reviewers and weakens the “industry-standard” story in interviews.
- Husky + lint-staged are configured, yet the lack of an env guardrail means suites may continue mutating `process.env` directly, contradicting the published workflow and risking flaky tests.
- Static-checks and unit-test docs already describe expectations (metrics tracking, CI order), so updating the tooling/docs combo is a contained, portfolio-friendly enhancement rather than a new project.

# Plan

1. Extend the `__tests__` override in `eslint.config.mjs` with the promised `no-restricted-properties` (or `no-process-env`) rule, allowing only approved helpers (`withTestEnv`, `getEnv`).
2. Run `npx eslint "__tests__/**/*.{ts,js}"` and `npm run lint` to confirm zero regressions; fix any suites that violate the new guardrail by refactoring them to use the helper.
3. Update the env-config documentation set (`with-test-env-helper.md`, `legacy-test-cleanup.md`, `env-config-overhaul-plan.md`, `env-config-overhaul-tickets.md`, `env-config-review.md`) plus the static-checks README/metrics tracker to capture the new enforcement state and reference the `npm run lint:tests` verification command.
4. Log the change and runtimes in the relevant trackers so CI/CD reviewers can see objective proof (metrics + checklist updates) when the todo is closed.

# Checklist

- [x] Add the env guardrail rule to `eslint.config.mjs` and document any helper allowlist comments inline. _(Done 2026-01-05 — see `eslint.config.mjs:111-125`.)_
- [x] Refactor lingering suites that still touch `process.env` to rely on `withTestEnv` (or feature-specific getters), then re-run ESLint to verify the override is clean. _(Verified via `npx eslint "__tests__/**/*.{ts,js}"` on 2026-01-05; no suites required changes.)_
- [x] Update the env-config docs and static-checks references to state the guardrail is enforced and describe the verification command.
- [ ] Record lint runtime/observations in `docs/internal/initiatives/tests-1-static-checks/metrics-tracker.md` (and any relevant ticket/checklist files) to preserve evidence for portfolio reviews.
