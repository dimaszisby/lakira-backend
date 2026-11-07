# Schemathesis Checklist – Lakira Backend

Use this checklist alongside the main contract-test checklist when building and running Schemathesis-based fuzzing.

## Phase A – Bootstrap

- [x] Install Schemathesis dependency and capture install instructions — owner: Codex assist (2026-01-14) (`schemathesis/requirements.txt` + README `#1 Installation` steps, use venv + `pip install -r ...`).
- [x] Ensure `npm run docs:openapi:generate` produces the latest OpenAPI JSON — owner: Codex assist (2026-01-14) (runner scripts check for the file and block execution with guidance if stale/missing; README section 2 reinforces the prerequisite).
- [x] Implement local runner script (`tests/contract/schemathesis/scripts/run-local.js`) invoked by `npm run test:contract:schemathesis:local` — owner: Codex assist (2026-01-14) (enforces env vars, tags, OpenAPI freshness, and writes timestamped reports).
- [x] Implement staging runner script (`schemathesis/scripts/run-staging.js`) invoked by `npm run test:contract:schemathesis:staging` — owner: Codex assist (2026-01-14) (supports token/base URL overrides + targeted endpoints).
- [x] Create `reports/local` and `reports/staging` folders with `.gitkeep` or first run artifacts — owner: Codex assist (2026-01-14) (see `schemathesis/reports/<env>/.gitkeep`).
- [x] Document CLI flags + environment requirements in this folder’s README (link from top-level README) — owner: Codex assist (2026-01-14) (`schemathesis/README.md` covers install, env vars, troubleshooting, and next steps; linked from main contract-test README).

## Phase B – Full Path Coverage

- [ ] Keep `SCHEMATHESIS_*_ENDPOINT_TAGS` aligned with OpenAPI tags (`Auth`, `Analytics`, `Metric Logs`, etc.) or add operationId filters so every contract scope path is fuzzed.
- [ ] Ensure the `stateful` phase stays enabled and layer hooks/helpers to fetch seeded IDs for nested endpoints (e.g., metrics → logs).
- [ ] Add custom checks/assertions for analytics caching headers (ETag, Cache-Control) in Schemathesis hooks.
- [ ] Limit examples per endpoint (e.g., `--max-examples 50`) to keep runtime predictable; document chosen values.
- [ ] Capture baseline runtime + coverage stats in metrics tracker.

## Phase C – CI/Nightly Integration

- [ ] Add Schemathesis dev dependency + CLI invocation to GitHub Actions nightly workflow (cron).
- [ ] Inject staging base URL + auth token via Actions secrets; avoid committing credentials.
- [ ] Upload Schemathesis HAR (JSON) + JUnit reports as artifacts.
- [ ] Add alerting (e.g., Slack webhook) for nightly job failures.
- [ ] Log failures + follow-up actions in `incidents.md`.

## Maintenance

- [ ] Re-run `docs:openapi:generate` after any schema-affecting PR and re-run Schemathesis locally.
- [ ] Update scripts/checks when new endpoint tags or headers are introduced.
- [ ] Clean up stale failure reproductions; keep latest known issues for onboarding.
- [ ] Review runtime + failure rate monthly and update `metrics-tracker.md`.
- [ ] Log meaningful Schemathesis runs (command, artifacts, findings) in `schemathesis/findings.md`.
