# Contract Test Incidents – Lakira Backend

## 2026-01-14 – Schemathesis Baseline Run Reveals 112 Failures

- **Context:** First execution of `npm run test:contract:schemathesis:local` (reports under `schemathesis/reports/local/2026-01-14T08-19-10-426Z/`) using `.env.test` data via a dev-mode server on port 8002.
- **Impact:** 31/31 operations fuzzed but zero passed due to:
  - Response-envelope drift vs. OpenAPI schemas (missing `data.*` wrappers, omitted required fields).
  - Global rate limiter returning 429 for bulk fuzzing (should allow contract client or expose 429 in spec).
  - TRACE requests returning 404 instead of the documented 405 for unsupported methods.
  - Several endpoints returning 500 when receiving intentionally malformed payloads instead of defensive 4xx errors.
- **Next Actions:**
  1. Done (2026-01-14) Added `DISABLE_RATE_LIMITING` env toggle + docs so contract/Schemathesis runs bypass throttling noise.
  2. Align OpenAPI schemas with the actual success envelopes (or update the implementation to match the documented response shape).
  3. Implement blanket 405 handling (or update the spec) for unsupported HTTP verbs so TRACE/OPTIONS behaviour is deterministic.
  4. Harden analytics + metric controllers to return validation errors rather than unhandled 500s when fuzzed payloads are invalid.

## 2026-01-14 – Schemathesis Rerun (Limiter Disabled, Examples + Coverage)

- **Context:** Re-ran `npm run test:contract:schemathesis:local` with `SCHEMATHESIS_LOCAL_PHASES=examples,coverage`, `SCHEMATHESIS_LOCAL_MAX_EXAMPLES=5`, and the new `DISABLE_RATE_LIMITING=true` flag. Reports: `schemathesis/reports/local/2026-01-14T10-25-10-852Z/`.
- **Impact:** 31/31 endpoints still exercised but failures dropped to 43, all attributable to schema drift, missing seeded IDs (404), or unsupported method handling. No 429 responses observed, confirming the limiter toggle works.
- **Next Actions:**
  1. Done (2026-01-14) Add a global 405 fallback for TRACE requests (`disallowTraceMethod` middleware) so unsupported verbs stop returning 404.

2.  Done (2026-01-15) Update the OpenAPI generator to include explicit 400/404 responses for cursor + stats endpoints so validation errors and not-found scenarios are documented.
3.  Update OpenAPI schemas and response wrappers to reflect actual payloads (or adjust controllers to match the documented `data` shape).
4.  Wire Schemathesis pre-run hooks to pull IDs from `tmp/contract-seed.json` so tests stop targeting non-existent `a1b2c3d4-...` resources.

## 2026-01-15 – Branch Protection / Staging Secret Work Pending

- **Context:** CI now runs `contract_local` (Newman + Schemathesis) automatically, but branch protection and staging secrets are not yet enforced. Without branch protection, developers can merge even if contract tests fail locally/CI; without staging secrets (`STAGING_*`, `SCHEMATHESIS_STAGING_*`), the `deploy_staging` → `contract_staging` path cannot run.
- **Impact:** Contract regressions could slip into `main` if reviewers forget to check the `contract_local` status, and staging deploy validations are blocked until the secrets/hook setup is finished.
- **Next Actions:**
  1. Update GitHub branch protection on `main`/`develop` to require the `contract_local` job (per `docs/reference/ci-pipeline/pipeline-overview.md` §7).
  2. Provision the staging secrets listed in `postman-newman/STAGING_RUNBOOK.md` and document the rotation date in `metrics-tracker.md` once complete.
  3. After secrets exist, run `deploy_staging` → `contract_staging` once and log runtime/artifacts in `metrics-tracker.md`; open additional incidents if the first run uncovers API drift.

## 2026-01-15 – Branch Protection / Staging Secret Work Pending

- **Context:** CI now runs `contract_local` (Newman + Schemathesis) automatically, but branch protection and staging secrets are not yet enforced. Without branch protection, developers can merge even if contract tests fail locally/CI; without staging secrets (`STAGING_*`, `SCHEMATHESIS_STAGING_*`), the `deploy_staging` → `contract_staging` path cannot run.
- **Impact:** Contract regressions could slip into `main` if reviewers forget to check the `contract_local` status, and staging deploy validations are blocked until the secrets/hook setup is finished.
- **Next Actions:**
  1. Update GitHub branch protection on `main`/`develop` to require the `contract_local` job (per `docs/reference/ci-pipeline/pipeline-overview.md` §7).
  2. Provision the staging secrets listed in `postman-newman/STAGING_RUNBOOK.md` and document the rotation date in `metrics-tracker.md` once complete.
  3. After secrets exist, run `deploy_staging` → `contract_staging` once and log runtime/artifacts in `metrics-tracker.md`; open additional incidents if the first run uncovers API drift.
