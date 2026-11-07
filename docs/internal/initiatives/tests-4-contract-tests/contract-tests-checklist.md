# Contract Tests Checklist – Lakira Backend

Use this checklist to track the contract-test program end-to-end (Postman/Newman + Schemathesis). Update the owner + date + reference PR/commit when completing each item.

---

## Phase 0 – Audit & Documentation Scaffolding Done (2026-01-14)

- [x] Inventory existing Postman/Schemathesis assets and note gaps in plan — owner: @dimaspramudya (2026-01-14)
- [x] Create top-level doc kit (`README`, plan, checklist, ticket, decisions, incidents, metrics) — owner: Codex assist (2026-01-14)
- [x] Link CI/CD documentation + integration-test references from README — owner: Codex assist (2026-01-14)

---

## Phase 1 – Postman/Newman Foundation (Superseded — Newman retired in #75, `a4635f3`)

- [x] Implement deterministic contract-test seed script exporting stable IDs/tokens for users, categories, metrics, metric settings, and logs (see `seed-strategy.md`) — owner: Codex assist (2026-01-14) [`npm run seed:contract-tests` → `tmp/contract-seed.json`].
- [x] Populate `environments/lakira-local.postman_environment.json` with local base URL + fixture IDs — owner: Codex assist (2026-01-14) (IDs from deterministic seed constants; token sourced from `tmp/contract-seed.json`).
- [x] Populate `environments/lakira-staging.postman_environment.json` with placeholder variables (real secrets injected via CI) — owner: Codex assist (2026-01-14) (`{{STAGING_*}}` variables documented for GitHub Actions secrets).
- [x] Author base requests for every endpoint group (analytics, metrics, metric-logs, metric-settings, auth) covering happy paths — owner: Codex assist (2026-01-14) (`tests/contract/postman-newman/collections/*.json` populated).
- [x] Add Postman tests to assert status codes, JSON schema, and key headers for each happy path — owner: Codex assist (2026-01-14) (collections assert success envelope, required headers, and seeded IDs).
- [x] Write Newman runner scripts (`scripts/run-contract-local.js`, `scripts/run-contract-staging.js`) invoked by package.json scripts — owner: Codex assist (2026-01-14) (scripts seed local DB, enforce staged env vars, and call Newman sequentially).
- [x] Store Newman reports under `postman-newman/reports/local|staging` with CLI + HTML outputs — owner: Codex assist (2026-01-14) (runner scripts create timestamped folders with `.html` + `.xml` per collection).
- [x] Update Postman README/checklist with setup steps + troubleshooting — owner: Codex assist (2026-01-14) (README sections 6–11 describe local/staging runners, env vars, and runtime variables).

---

## Phase 2 – Negative Coverage & Schemathesis Kickoff

- [x] Extend collections with validation/auth/not-found scenarios per endpoint checklist — owner: Codex assist (2026-01-14) (see `postman-newman/collections/*` added 401/400/404 flows).
- [x] Add ETag + Cache-Control assertions for analytics dashboard + visualization requests — owner: Codex assist (2026-01-14) (dashboard + metric viz tests store and reuse `ETag` for 304 coverage).
- [x] Introduce JSON Schema snippets or scripted validators for dashboard payloads — owner: Codex assist (2026-01-14) (analytics dashboard test validates core fields/arrays).
- [x] Finalize Schemathesis CLI scripts for local + staging — owner: Codex assist (2026-01-14) (`npm run test:contract:schemathesis:<env>` invokes `schemathesis/scripts/run-*.js`, enforces OpenAPI freshness, and drops JSON/JUnit artifacts under `schemathesis/reports/<env>/`).
- [x] Create Schemathesis run plan/checklist with failure triage workflow — owner: Codex assist (2026-01-14) (`schemathesis/PLAN.md`, `CHECKLIST.md`, and new README/requirements describe install, env vars, hooks, and metrics expectations).
- [x] Capture first Schemathesis report and log runtime + findings in metrics tracker — owner: Codex assist (2026-01-14) (local run via `npm run test:contract:schemathesis:local` against `http://localhost:8002/api/v1` surfaced 112 failures: schema drift, missing 405 handling, & 429 throttles; artifacts stored under `schemathesis/reports/local/2026-01-14T08-19-10-426Z/`, tracker + incidents updated with follow-up actions).

---

## Phase 3 – CI/CD Integration & Enforcement

- [x] Implement `contract_local`, `deploy_staging`, `contract_staging` jobs in `.github/workflows/backend-ci.yml` per CI plan — owner: Codex assist (2026-01-14) (`contract_local` now regenerates OpenAPI, seeds fixtures, runs Newman + Schemathesis, and uploads artifacts; staging jobs remain pending secrets before first run).
- [ ] Inject staging secrets via GitHub Actions + document rotation steps (README + CI plan now document the required `STAGING_*` / Schemathesis secrets; awaiting secret creation + rotation cadence sign-off).
- [x] Upload Newman (and later Schemathesis) artifacts from CI to `newman-*/` artifact names — owner: Codex assist (2026-01-14) (`contract_local` uploads `newman-contract-local` + `schemathesis-contract-local`; add staging upload once those runs are wired).
- [x] Require `contract_local` job for PR merges; document gating in README + CI plan — owner: @dimaspramudya (2026-01-15) (ruleset “Protect main & develop (contract gate)” now enforces `contract_local`; docs updated with enforcement steps).
- [ ] Run staging contract tests end-to-end (deploy → test) at least once and document results in metrics tracker (blocked until Render deploy hook + `STAGING_*` / `SCHEMATHESIS_STAGING_*` secrets are provisioned and recorded in `metrics-tracker.md`; follow `postman-newman/STAGING_RUNBOOK.md` when executing).

---

## Phase 4 – Nightly Schemathesis & Portfolio Hardening

- [ ] Schedule nightly (cron-based) Schemathesis job on `main` hitting staging base URL.
- [ ] Configure alerting (Slack/email) for contract test failures; link runbook in README.
- [ ] Track weekly runtime, pass rate, and defect counts in metrics tracker.
- [ ] Evaluate expanding coverage to partner/3rd-party consumers; log ADR if scope changes.
- [ ] Document rollback / disablement procedure for contract tests in incidents or README.

---

## Persistent Maintenance Tasks

- [ ] Update Postman collections + Schemathesis configs whenever OpenAPI/spec changes (tie to PR template).
- [ ] Refresh environment files/tokens quarterly or when test accounts rotate.
- [ ] Review `decisions.md` + `incidents.md` each sprint to ensure new learnings are logged.
- [ ] Keep `metrics-tracker.md` current after every CI run that meaningfully changes runtime or coverage numbers.
