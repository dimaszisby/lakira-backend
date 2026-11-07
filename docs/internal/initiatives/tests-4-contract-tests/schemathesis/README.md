# Schemathesis Contract Guide

**Status:** Active
**Last updated:** 2026-04-13

Schemathesis provides spec-driven generative contract coverage complementary to Newman.

## Setup

```bash
python3 -m venv .venv-schemathesis
source .venv-schemathesis/bin/activate
pip install -r tests/contract/schemathesis/requirements.txt
```

## Prerequisites

- OpenAPI artifact is fresh (`npm run docs:openapi:generate`).
- Deterministic seed data exists (`npm run seed:contract-tests`).
- Backend is running and reachable.
- Use `DISABLE_RATE_LIMITING=true` in local fuzzing environments to reduce noise.

## Commands

```bash
npm run test:contract:schemathesis:local
npm run test:contract:schemathesis:local:quick
npm run test:contract:schemathesis:local:gate
npm run test:contract:schemathesis:local:full
npm run test:contract:schemathesis:staging
```

Reports are written under `reports/local|staging/<timestamp>/`.

## Environment Inputs

- Local: `SCHEMATHESIS_LOCAL_TOKEN`, optional local profile overrides.
- Staging: `SCHEMATHESIS_STAGING_BASE_URL`, `SCHEMATHESIS_STAGING_TOKEN`.

## Seed / reproducibility

- `gate` pins a default seed (`LOCAL_PROFILE_PRESETS.gate.seed` in `run-local.js`) so a gate verdict
  on an unchanged tree is reproducible instead of a fresh Hypothesis sample each run. `full` and
  `exploratory` intentionally have no preset seed and keep drawing a new one per run, to retain their
  exploratory value.
- Any profile's seed can be overridden with `SCHEMATHESIS_LOCAL_SEED` — e.g. to replay a specific past
  run or explore beyond `gate`'s default.
- The effective seed is logged in the runner's `Profile "..." resolved to ...` line, and Schemathesis's
  own `Seed: <value>` line (printed at the end of every run, pass or fail) is captured into
  `reports/local/<timestamp>/seed.txt` alongside the JUnit/HAR reports.

## Maintenance Rules

- Keep hooks and profile defaults aligned with runtime validation behavior.
- Log significant failures/findings in `findings.md`, `../incidents.md`, and `../metrics-tracker.md`.
