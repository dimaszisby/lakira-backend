# Contract Test Decisions – Lakira Backend

## CT-ADR-001 — Dual-Layer Contract Strategy (Accepted 2026-01-14)

**Context:** Initial documentation exposed two needs: (1) curated end-to-end contract checks to mirror FE expectations, and (2) fuzzing to catch schema drift that humans might miss. Only Postman docs existed, and Schemathesis folders were empty.

**Decision:** Adopt a dual-layer approach:

- Author and maintain feature-specific Postman collections (analytics, metrics, logs, settings, auth) executed via Newman for deterministic asserts.
- Introduce Schemathesis runs from the same OpenAPI file to fuzz endpoints locally, on PRs (optional), and nightly on staging.

**Options considered:**

1. Only Postman/Newman — easier to ship but misses unexpected 5xx/validation gaps.
2. Only Schemathesis — faster to bootstrap but lacks business-level assertions (headers, cross-field expectations).
3. Dual-layer (chosen) — slower to ramp but provides human-readable coverage + automated fuzzing.

**Consequences:**

- Need to maintain both toolchains + scripts, resulting in more pipeline minutes.
- Metrics tracker must report on both Newman and Schemathesis runs.
- Doc kit must keep references for both workstreams (see README + plan).

## CT-ADR-002 — Dedicated Contract-Test Seeds (Proposed 2026-01-14)

**Context:** Contract tests require stable IDs/tokens across environments. Existing integration seeds are optimized for Jest helpers and may truncate tables aggressively, causing volatility.

**Decision (proposed):** Create a dedicated contract seeding script (`scripts/seed-contract-tests.ts`) that:

- Idempotently creates required users, metrics, logs, settings.
- Outputs environment JSON snippets or `.env.contract` values consumed by Newman & Schemathesis.
- Runs separately from Jest lifecycle to avoid collision with integration tests.

**Options considered:**

1. Reuse integration seeds and capture IDs manually — fastest but brittle and undocumented.
2. Hard-code fixtures inside Postman env files — violates secret management and becomes stale quickly.
3. Dedicated seed script (preferred) — provides single source of truth + automation.

**Consequences:**

- Requires maintenance when schemas change.
- Script must run in CI before `contract_local`.
- Until implemented, checklist items remain blocked; update status once merged.
