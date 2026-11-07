# Backend CI/CD & Contract Follow-up Backlog

## Purpose

This file captures non-blocking follow-up items that were migrated from ephemeral todo notes before cleanup.

Current baseline:

- `npm run contract:local:full` is green end-to-end (Newman + Schemathesis examples/coverage/fuzzing/stateful).
- Contract local development scope is considered complete for the current phase.

## Open Follow-ups

### 1) Monitor `contract_local` CI stability after health/wait hardening

- Source: `docs/internal/todos/2026-01-21-todo-contract-local-health-fix.md`
- Why: the implementation is complete, but the original follow-up requested post-change CI monitoring.
- Action:
  - Watch upcoming backend CI runs for `contract_local` wait/start regressions.
  - Confirm backend boot logs remain actionable when failures occur.
- Exit criteria:
  - Multiple consecutive green runs after meaningful workflow/code changes.

### 2) Add extra safeguards for future staging pipeline build/start order

- Source: `docs/internal/todos/2026-01-20-todo-github-actions-env.md`
- Why: local/CI test jobs are aligned, but staging pipeline hardening is a separate concern.
- Action:
  - When `deploy_staging` / `contract_staging` is enabled, enforce deterministic order:
    - install deps
    - build
    - migrate/prepare runtime
    - run validation steps
  - Keep env parity documented in `docs/reference/environments.md`.
- Exit criteria:
  - Staging workflow documents and scripts explicitly enforce compile-before-run behavior.

### 3) (Optional) Port seeded fixture hook strategy into staging Schemathesis runner

- Source: `docs/internal/todos/2026-01-26-todo-schemathesis-hooks-migration.md`
- Why: currently not required because staging exercises shared data; only needed if staging data becomes unstable/non-deterministic.
- Trigger to execute:
  - Frequent staging Schemathesis failures caused by missing deterministic IDs or unstable fixture shape.
- Exit criteria:
  - Either explicitly documented as "not needed", or implemented and validated in staging runner docs/scripts.

### 4) Define nightly Schemathesis cadence + artifact review expectations

- Source: `docs/internal/incidents/2026-01-22-github-actions-schemathesis.md`
- Why: this incident explicitly called out recurring follow-up around deep contract drift detection beyond PR-time checks.
- Action:
  - Define whether nightly deep Schemathesis runs are enabled for backend.
  - If enabled, document owner/triage expectations and artifact handling (JUNIT/HAR retention + incident linkage).
  - Keep `contract_local` gate deterministic and fast; reserve nightly for deeper coverage/stateful drift signals.
- Exit criteria:
  - CI/CD docs explicitly state nightly contract policy (enabled/disabled), and where failures are triaged.

## Notes

- This backlog is intentionally small and long-lived.
- Keep day-to-day implementation tracking in active tickets/issues, and retain this file as the source of migrated follow-ups from deleted todo notes.
