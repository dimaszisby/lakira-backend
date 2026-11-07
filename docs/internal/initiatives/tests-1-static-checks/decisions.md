# Static Checks Decision Log

## ADR-001 — Define Initial Static Tooling Stack (Proposed 2025-02-14)

- **Context:** Following the test-structure overhaul, the repo lacked documentation and enforcement for static checks even though ESLint/TypeScript scripts existed.
- **Decision:** Treat ESLint (`npm run lint`), TypeScript (`npm run typecheck`), and Prettier (new `format:check`/`format:write`) as the core toolkit for static validation. Additional analyzers (OpenAPI validation, dependency audits) will be tracked as follow-up ADRs after the core scripts stabilize.
- **Consequences:** Documentation and CI work will prioritize these three tools; future additions need explicit ADRs to avoid scope creep.
- **References:** `docs/internal/initiatives/tests-1-static-checks/static-checks-plan.md`, `docs/internal/initiatives/tests-1-static-checks/static-checks-ticket.md`.

## ADR-002 — Align TS Path Aliases to Repo Root

Promoted to the architecture decision registry as **[ADR-0001](../../../explanation/decisions/adr-0001-align-ts-path-aliases-to-repo-root.md)**. That file is authoritative; this entry is a pointer.

## ADR-003 — NodeNext Specifier Strategy

Promoted to the architecture decision registry as **[ADR-0002](../../../explanation/decisions/adr-0002-nodenext-specifier-strategy.md)**. That file is authoritative; this entry is a pointer.

## ADR-004 — Formatting Enforcement Strategy (Accepted 2025-02-14)

- **Context:** Phase 1 requires Prettier-backed formatting plus clarity on whether enforcement happens via CI, pre-commit hooks, or both. Prior to this ADR the repo had no formatting scripts.
- **Decision:** Add `npm run format:check` and `npm run format:write` powered by Prettier, scoped via `.prettierignore`. Static checks and CI will rely on `format:check` (starting Phase 2) while contributors trigger `format:write` manually; pre-commit automation (Husky/lint-staged) remains optional until automation tasks land.
- **Consequences:** Formatting is now part of the static toolkit without forcing hook installs on a solo developer. The GitHub Actions `checks` job executes `format:check` between lint and typecheck so CI fails fast on formatting regressions. Locally, Husky’s `pre-commit` hook invokes lint-staged so ESLint (`--fix --max-warnings=0`) and Prettier run only on staged files before every commit. Future automation will hook into the same scripts, keeping the workflow consistent across local + CI environments.
- **References:** `package.json` scripts, `.prettierignore`, `docs/internal/initiatives/tests-1-static-checks/static-checks-plan.md`.

## ADR-005 — OpenAPI Spec Consistency Check

Promoted to the architecture decision registry as **[ADR-0003](../../../explanation/decisions/adr-0003-openapi-spec-consistency-check.md)**. That file is authoritative; this entry is a pointer.
