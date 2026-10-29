# Todo — The security delta's CORS rule reads a file the CORS options left

- **Status:** Issue #260 (was register row B-86). Open
- **Created:** 2026-10-22
- **Owner:** unassigned
- **Origin:** the `security:delta:gate` run on `fix/proxy-trust-and-xss-clean`
  ([`proxy-trust-and-xss-clean`](../initiatives/proxy-trust-and-xss-clean/README.md)). Register row
  B-86

---

## What

`scripts/security/security-delta-check.mjs` rule `CFG-CORS-001` looks for the CORS `methods`
list in `src/server.ts`. That list moved to `mountHttpPipeline`
(`src/shared/middleware/http-pipeline.ts`) with ADR-0061, and it holds `PATCH`. The rule finds no
list, so every run reports `AUTO-CFG-CORS-001`, "CORS allow-methods omits PATCH while PATCH routes
exist", at medium. The gate passes, since only Critical and High trip it, but the finding is false,
and a real omission would now go unreported.

## Done when

- The rule reads `http-pipeline.ts`, or better, fails when it finds no `methods` list at all rather
  than treating a missing list as one without `PATCH`
- A run on `dev` reports two medium findings (`sequelize`, `uuid`), not three
