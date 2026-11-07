# Schemathesis Findings Log – Lakira Backend

Track notable Schemathesis executions, their parameters, and the main follow-up items uncovered during each run.

---

## 2026-01-14 – Local Baseline (full phases, max-examples=50)

- **Command:** `SCHEMATHESIS_LOCAL_BASE_URL=http://localhost:8002/api/v1 SCHEMATHESIS_LOCAL_TOKEN=<seeded JWT> npm run test:contract:schemathesis:local`
- **Phases:** examples, coverage, fuzzing, stateful (default)
- **Artifacts:** `schemathesis/reports/local/2026-01-14T08-19-10-426Z/` (HAR + JUnit)
- **Result:** 31/31 endpoints hit, 112 failures (schema drift, missing 405 handling, rate limiting noise).
- **Notes:** High volume of 429s due to global limiter plus numerous response-envelope mismatches vs OpenAPI (`data.items` vs `items` at top level). Incident + metrics tracker updated; prompted addition of `DISABLE_RATE_LIMITING` toggle.

---

## 2026-01-14 – Local Rerun (phases=examples,coverage; max-examples=5; rate limiter disabled)

- **Command:** `SCHEMATHESIS_LOCAL_PHASES=examples,coverage SCHEMATHESIS_LOCAL_MAX_EXAMPLES=5 SCHEMATHESIS_LOCAL_BASE_URL=http://localhost:8002/api/v1 SCHEMATHESIS_LOCAL_TOKEN=<seeded JWT> npm run test:contract:schemathesis:local`
- **Artifacts:** `schemathesis/reports/local/2026-01-14T10-25-10-852Z/` (HAR + JUnit)
- **Result:** 31/31 endpoints exercised, 43 failures (no 429 responses). Runtime ~61 seconds with reduced phases.
- **Key findings**
  1. **Spec drift persists** – list/detail responses still omit schema-required properties (`data.items`, `userId`, `metricId`, etc.), and error payloads return HTTP 200/400 contrary to OpenAPI.
  2. **Unsupported method handling** – every TRACE request returns 404 instead of the documented 405, affecting 23 operations (fixed later via global guard).
  3. **Seed data references** – many requests use hard-coded IDs (`a1b2c3d4-…`) not present in the deterministic seed, producing 404 “not found” errors. Need to align env variables with seeded IDs.
  4. **Business validation vs contract** – endpoints like `POST /metric-categories` and `/auth/register` reject duplicates with 400 while the spec expects 201. Decide whether to update the spec or relax Schemathesis expectations.
- **Next Actions**
  - Implement a 405 fallback (router middleware) or update the OpenAPI spec to document 404 for unsupported verbs.
  - Synchronize success payloads with the “data” envelope described in OpenAPI or revise the spec to mirror actual responses.
  - Update Schemathesis hooks/env vars to use real seeded IDs from `tmp/contract-seed.json` to avoid 404 noise.
  - Re-run with full phases once schema + method issues are fixed.
- **Follow-up (2026-01-15):** Updated the OpenAPI generator to include explicit `400`/`404` responses for cursor/stats endpoints so validation errors (empty search terms, unknown metric IDs) and not-found scenarios are treated as documented behavior in Schemathesis.
